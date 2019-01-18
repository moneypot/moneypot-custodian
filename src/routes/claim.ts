import * as hi from 'hookedin-lib';

import * as nonces from '../util/nonces';
import dbClaimCoin from '../db/claim-coin';
import lookupClaimCoinResponse from '../db/lookup-claim-coin-response';

export async function claim(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const claim = hi.ClaimRequest.fromPOD(body);
  if (claim instanceof Error) {
    throw claim;
  }


  const blindNonce = body['blindNonce'];
  if (!blindNonce || typeof blindNonce !== 'string') {
      throw new Error("missing blindNonce");
  }

  const nonce = nonces.pull(blindNonce);

  // TODO: this is kinda silly... if they retried they would have a diff nonce??
  if (nonce === undefined) { // If we don't have the nonce, maybe they're searching for a historic entry
    const ackResponse = await lookupClaimCoinResponse(claim.hash());
    if (ackResponse === undefined) {
      throw new Error("could not find");
    }
    return ackResponse.toPOD();
  }

  const response = await dbClaimCoin(claim, nonce);
  if (response === undefined) {
    throw "COULD_NOT_FIND_UNCLAIMED_COIN";
  }

  return response.toPOD();
}
