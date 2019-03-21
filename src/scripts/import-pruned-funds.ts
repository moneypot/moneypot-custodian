import assert from 'assert';
import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';
import { pool } from '../db/util';

console.log('Importing prune funds');

async function run() {
  const unimporteds = await pool.query(`
        SELECT txid, vout, amount, claimant, derive_index
        FROM hookins WHERE txid IS NOT NULL
    `);

  for (const unimported of unimporteds.rows) {
    const txid = Buffer.from(unimported['txid'], 'hex');
    const vout: number = unimported['vout'];
    assert(Number.isSafeInteger(vout));
    const amount: number = Number.parseInt(unimported['amount'], 10);
    assert(Number.isSafeInteger(amount) && amount > 0);
    const claimant = hi.PublicKey.fromBech(unimported['claimant']);
    if (claimant instanceof Error) {
      throw claimant;
    }

    const deriveIndex = Number.parseInt(unimported['derive_index'], 10);
    assert(Number.isSafeInteger(deriveIndex) && deriveIndex >= 0);

    const hookin = new hi.Hookin(txid, vout, amount, claimant, deriveIndex);

    const basePrivkey = hi.Params.fundingPrivateKey;

    const spendingPrivkey = basePrivkey.tweak(hookin.getTweak());

    console.log('importing: ', spendingPrivkey.toWif());
    console.log('prebalance: ', await rpcClient.getBalance());

    await rpcClient.importPrivateKey(spendingPrivkey.toWif());
    await rpcClient.importPrunedFunds(hookin.txid);

    console.log('postbalance: ', await rpcClient.getBalance());

    console.log('got hookin: ', hookin.toPOD());
  }
}

run().catch(err => {
  console.error('Caught error: ', err);
});
