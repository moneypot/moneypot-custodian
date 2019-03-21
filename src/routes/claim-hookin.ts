import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import * as nonceLookup from '../util/nonces';

import dbClaim from '../db/claim';

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

  return await dbClaim(claimReq);
}
