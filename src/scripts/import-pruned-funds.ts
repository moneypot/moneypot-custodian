import assert from 'assert';
import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';
import { pool } from '../db/util';

console.log('Importing prune funds');

async function run() {
  const unimporteds = await pool.query(`
        SELECT hash, hookin FROM hookins WHERE NOT imported
    `); // TODO: remove limit 2

  for (const unimported of unimporteds.rows) {
    const hookin = hi.Hookin.fromPOD(unimported['hookin']);
    if (hookin instanceof Error) {
      throw hookin;
    }

    const basePrivkey = hi.Params.fundingPrivateKey;

    const spendingPrivkey = basePrivkey.tweak(hookin.getTweak());

    console.log('importing: ', spendingPrivkey.toWif());
    console.log('prebalance: ', await rpcClient.getBalance());

    await rpcClient.importPrivateKey(spendingPrivkey.toWif());
    await rpcClient.importPrunedFunds(hookin.txid);

    console.log('postbalance: ', await rpcClient.getBalance());

    await pool.query(`UPDATE hookins SET imported = true WHERE hash = $1`, [unimported['hash']]);
  }
}

run().catch(err => {
  console.error('Caught error: ', err);
});
