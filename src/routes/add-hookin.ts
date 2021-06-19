import * as hi from 'moneypot-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey, ackSecretKey } from '../custodian-info';
import processHookin from '../util/process-hookin';

import { pool, poolQuery } from '../db/util';
import * as config from '../config';

// body should be { hookin, claimRequest }
// returns an acknowledgement
type R = hi.POD.Hookin & hi.POD.Acknowledged & { kind: 'Hookin' };
export default async function addHookin(hookin: hi.Hookin): Promise<R> {
  const txOut = await rpcClient.smartGetTxOut(hi.Buffutils.toHex(hookin.txid), hookin.vout);
  if (!txOut) {
    throw 'could not find txout';
  }
  if (txOut.amount != hookin.amount) {
    throw 'hookin cheating attempt';
  } 
  const expectedAddress = ci.fundingKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(config.bNetwork);
  const expectedNestedAddress = ci.fundingKey
    .tweak(hookin.getTweak().toPublicKey())
    .toNestedBitcoinAddress(config.bNetwork);
  if (expectedAddress !== txOut.address) {
    if (expectedNestedAddress !== txOut.address) {
      console.warn('Expected address: ', expectedAddress, expectedNestedAddress, ' got address: ', txOut.address);
      throw 'INVALID_HOOKIN';
    }
  }

  const ackdClaimable = hi.Acknowledged.acknowledge(hookin, ackSecretKey);

  const ackdClaimablePOD = ackdClaimable.toPOD() as R;
  
  // await pool.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD]);
  await poolQuery(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD], ackdClaimablePOD, 'add-hookin #1: adding hookin');
  
  // process in the background...
  processHookin(hookin);

  return ackdClaimablePOD;
}
