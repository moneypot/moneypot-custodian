import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import * as nonceLookup from '../util/nonces';

import dbClaim from '../db/claim';
import { pool } from '../db/util';

// returns an acknowledgement
export default async function(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const claimReq = hi.ClaimHookinRequest.fromPOD(body);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, claimReq.claim.claimant)) {
    throw 'CLAIMANT_AUTHORIZATION_FAIL';
  }

  const hookin = claimReq.claim;

  const txOut = await rpcClient.getTxOut(hookin.txid, hookin.vout);

  // TODO: validate it exists

  // TODO: require a certain amount of confs..
  // const { confirmations } = txOut.result;

  const expectedAddress = hi.Params.fundingPublicKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(true);
  if (expectedAddress !== txOut.address) {
    console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
    throw 'INVALID_TRANSACTION_HOOKIN';
  }

  const ackResponse = await dbClaim(claimReq);

  // import in the background...
  importHookin(hookin);

  return ackResponse;
}

async function importHookin(hookin: hi.Hookin) {
  const basePrivkey = hi.Params.fundingPrivateKey;

  const spendingPrivkey = basePrivkey.tweak(hookin.getTweak()).toWif();

  try {
    await rpcClient.importPrivateKey(spendingPrivkey);
    await rpcClient.importPrunedFunds(hookin.txid);
    await pool.query(`UPDATE hookins SET imported = true WHERE hash = $1`, [hookin.hash().toBech()]);
  } catch (err) {
    console.error("could not import funds!", err);
  }


}
