import * as hi from 'hookedin-lib';
import assert from 'assert';
import { pool } from './util';
import lookupClaimCoinResponse from './lookup-claim-response';

export default async function(
  claimRequest: hi.ClaimRequest,
  secretNonces: hi.PrivateKey[]
): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {

  assert.strictEqual(claimRequest.coins.length, secretNonces.length);

  const blindedExistenceProofs = [];

  for (let i = 0; i < secretNonces.length; i++) {
    const secretNonce = secretNonces[i];
    const coin = claimRequest.coins[i];

    const blindedExistenceProof = hi.blindSign(
      hi.Params.blindingCoinPrivateKeys[coin.magnitude],
      secretNonce,
      coin.blindedOwner
    );

    blindedExistenceProofs.push(blindedExistenceProof);
  }

  const claimResponse = new hi.ClaimResponse(claimRequest, blindedExistenceProofs);
  const ackClaimResponse: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(
    claimResponse,
    hi.Params.acknowledgementPrivateKey
  );

  const updateRes = await pool.query(
    `UPDATE bounties SET claim_response = $1 WHERE hash = $2 AND claim_response IS NULL`,
    [
      ackClaimResponse.toPOD(),
      claimRequest.bounty.hash().toBech()
    ]
  );

  // It's possible we were beaten to it, and this coin was race-claimed. So let's check again
  if (updateRes.rowCount === 0) {
    const resp = await lookupClaimCoinResponse(claimRequest.bounty);
    if (resp === undefined) {
      throw new Error('something weird, couldnt update coin but couldnt find it either');
    }
    return resp;
  }
  assert.strictEqual(updateRes.rowCount, 1);

  return ackClaimResponse.toPOD();
}

