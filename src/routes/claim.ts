import * as hi from 'hookedin-lib';

import * as nonces from '../util/nonces';

export async function claim(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const claim = hi.ClaimRequest.fromPOD(body);

  if (!claim.isAuthorized()) {
    throw new Error('unauthorized claim!');
  }

  const blindNonce = body['blindNonce'];
  if (!blindNonce) {
      throw new Error("missing blindNonce");
  }

  const nonce = nonces.pull(blindNonce);
  if (!nonce) {
      throw "NO_SUCH_NONCE";
  }

  const claimHash = claim.hash();

  const blindedExistenceProof = hi.blindSign(
    hi.Params.blindingCoinPrivateKeys[claim.magnitude],
    nonce,
    claim.blindedOwner);

  const claimResponse = new hi.ClaimResponse(claimHash, blindedExistenceProof);


  const ackd: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(
    claimResponse, hi.Params.acknowledgementPrivateKey);

  return ackd.toPOD();
}
