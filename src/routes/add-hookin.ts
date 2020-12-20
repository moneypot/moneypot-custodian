import * as hi from 'moneypot-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey, ackSecretKey } from '../custodian-info';
import processHookin from '../util/process-hookin';

import { pool } from '../db/util';
import * as config from '../config';

// body should be { hookin, claimRequest }
// returns an acknowledgement
type R = hi.POD.Hookin & hi.POD.Acknowledged & { kind: 'Hookin' };
export default async function addHookin(hookin: hi.Hookin): Promise<R> {
  const txOut = await rpcClient.smartGetTxOut(hi.Buffutils.toHex(hookin.txid), hookin.vout);
  if (!txOut) {
    throw 'could not find txout';
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

  await pool.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD]);

  // process in the background...
  processHookin(hookin);

  return ackdClaimablePOD;
}
