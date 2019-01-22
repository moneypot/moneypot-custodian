import * as hi from 'hookedin-lib';

import * as nonces from '../util/nonces';
import dbClaimCoin from '../db/claim-coin';
import lookupClaimCoinResponse from '../db/lookup-claim-coin-response';
import * as assert from 'assert';

export async function claim(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {

  const claim = hi.ClaimRequest.fromPOD(body);
  if (claim instanceof Error) {
    throw claim;
  }

  console.log("Client trying to claim: ", claim.toPOD());

  // pre search if that coin was already claimed...
  let resp = await lookupClaimCoinResponse(claim.coin);
  if (resp !== undefined) {
      return resp.toPOD(); // found it, already claimed!
  }


  const nonce = nonces.pull(claim.blindingNonce.toBech());
  if (nonce === undefined) {
    throw "COULD_NOT_FIND_NONCE";
  }

  resp = await dbClaimCoin(claim, nonce);
  return resp.toPOD();
}
