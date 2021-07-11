import * as hi from 'moneypot-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey, ackSecretKey } from '../custodian-info';
import processHookin from '../util/process-hookin';

import { pool, withTransaction } from '../db/util';
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

  // make a transaction even though every hookin is deterministically derived from its parameters and thus a double insert won't necessarily harm as it would conflict - we prevent double process queries etc, just a bit cleaner
  // for example: double processHookins will cause strictEquals to fail on status inserts @ status.ts #19 as status would already be inserted - conflict .

  // we don't need to wait, if the hookin is new we can immediately return, if it is not we just return old ack.
  withTransaction(async (client) => {
    const res = await client.query(`SELECT claimable FROM claimables WHERE claimable->>'hash' = $1`, [
      ackdClaimablePOD.hash,
    ]);

    if (res.rowCount === 0) {
      await client.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [ackdClaimablePOD]);
      // process in the background...
      processHookin(hookin);
    }
  });

  return ackdClaimablePOD;
}
