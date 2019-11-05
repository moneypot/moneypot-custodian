import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey, ackSecretKey } from '../custodian-info';
import processHookin from '../util/process-hookin';

import { pool } from '../db/util';

// body should be { hookin, claimRequest }
// returns an acknowledgement
export default async function addHookin(hookin: hi.Hookin) {
  const txOut = await rpcClient.smartGetTxOut(hi.Buffutils.toHex(hookin.txid), hookin.vout);
  if (!txOut) {
    throw 'could not find txout';
  }

  const expectedAddress = ci.fundingKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(true);
  if (expectedAddress !== txOut.address) {
    console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
    throw 'INVALID_HOOKIN';
  }

  const ackdClaimable = hi.Acknowledged.acknowledge(hookin, ackSecretKey);

  const ackdClaimablePOD = ackdClaimable.toPOD();

  await pool.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD]);

  // process in the background...
  processHookin(hookin);

  return ackdClaimablePOD;
}
