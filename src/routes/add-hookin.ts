import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey, ackSecretKey } from '../custodian-info';

import { pool } from '../db/util';

// body should be { hookin, claimRequest }
// returns an acknowledgement
export default async function addHookin(hookin: hi.Hookin) {
  const txOut = await rpcClient.getTxOut(hookin.txid, hookin.vout);

  const expectedAddress = ci.fundingKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(true);
  if (expectedAddress !== txOut.address) {
    console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
    throw 'INVALID_HOOKIN';
  }

  const ackdClaimable = hi.Acknowledged.acknowledge(hookin, ackSecretKey);

  const ackdClaimablePOD = ackdClaimable.toPOD();

  await pool.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD]);

  // import in the background...
  importHookin(hookin);

  return ackdClaimablePOD;
}

async function importHookin(hookin: hi.Hookin) {
  const spendingPrivkey = fundingSecretKey.tweak(hookin.getTweak()).toWif();

  try {
    await rpcClient.importPrivateKey(spendingPrivkey);
    await rpcClient.importPrunedFunds(hookin.txid);
    // await pool.query(`UPDATE hookins SET imported = true WHERE hash = $1`, [hookin.hash().toPOD()]);
  } catch (err) {
    console.error('could not import funds!', err);
  }
}
