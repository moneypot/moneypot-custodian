import * as hi from 'hookedin-lib';

import * as nonceLookup from '../util/nonces';
import dbClaimCoin from '../db/claim';
import lookupClaimResponse from '../db/lookup-claim-response';

export async function claim(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  
  const claimReq = hi.ClaimRequest.fromPOD(body);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, claimReq.bounty.claimant)) {
    throw 'CLAIMANT_AUTHORIZATION_FAIL';
  }

  // TODO: uncomment this. We're keeping it commented to test thte rest of the code..
// const resp = await lookupClaimResponse(claimReq.claim);
  // if (resp !== undefined) {
  //   return resp;
  // }


  const blindingNonces = claimReq.coins.map(coin => coin.blindingNonce.toBech())

  const nonces = nonceLookup.pull(blindingNonces);

  return await dbClaimCoin(claimReq, nonces);
}
