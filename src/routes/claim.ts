import * as hi from 'hookedin-lib';

import * as nonces from '../util/nonces';

export async function claim(body: any) {
  const claim = hi.Claim.fromPOD(body);

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

  const blindedExistenceProof = hi.blindSign(hi.Params.blindingCoinPrivateKeys[claim.coinMagnitude], nonce, claim.blindedOwner);

  const claimed = new hi.Claimed(claimHash, blindedExistenceProof);

  claimed.acknowledge(hi.Params.acknowledgementPrivateKey);

  return claimed;
}
