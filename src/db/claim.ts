import * as hi from 'hookedin-lib';
import assert from 'assert';
import { pool } from './util';
import * as nonceLookup from '../util/nonces';

export default async function(
  claimRequest: hi.ClaimBountyRequest | hi.ClaimHookinRequest
): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const blindingNonces = claimRequest.coins.map(coin => coin.blindingNonce.toBech());

  const secretNonces = nonceLookup.pull(blindingNonces);

  assert.strictEqual(claimRequest.coins.length, secretNonces.length);

  const blindedExistenceProofs = [];

  for (let i = 0; i < secretNonces.length; i++) {
    const secretNonce = secretNonces[i];
    const coin = claimRequest.coins[i];

    const blindedExistenceProof = hi.blindSign(
      hi.Params.blindingCoinPrivateKeys[coin.magnitude.n],
      secretNonce,
      coin.blindedOwner
    );

    blindedExistenceProofs.push(blindedExistenceProof);
  }

  const prunedClaimRequest = new hi.ClaimRequest(
    claimRequest.claim.hash(),
    claimRequest.coins,
    claimRequest.authorization
  );

  const claimResponse = new hi.ClaimResponse(prunedClaimRequest, blindedExistenceProofs);
  const ackClaimResponse: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(
    claimResponse,
    hi.Params.acknowledgementPrivateKey
  );

  if (claimRequest instanceof hi.ClaimBountyRequest) {
    return await updateAndSelectBounty(claimRequest.claim, ackClaimResponse);
  } else if (claimRequest instanceof hi.ClaimHookinRequest) {
    return await insertAndSelectHookin(claimRequest.claim, ackClaimResponse);
  } else {
    const _: never = claimRequest;
    throw new Error('impossible!');
  }
}

async function updateAndSelectBounty(
  bounty: hi.Bounty,
  resp: hi.AcknowledgedClaimResponse
): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  // TODO(optimize): this can be optimized into a single query...

  const bountyHash = bounty.hash().toBech();

  await pool.query(
    `
    UPDATE bounties SET claim_response = $1 WHERE hash = $2 AND claim_response IS NULL
  `,
    [resp.toPOD(), bountyHash]
  );

  const selectRes = await pool.query(`SELECT claim_response FROM bounties WHERE hash = $1`, [bountyHash]);
  if (selectRes.rowCount === 0) {
    throw 'NOT_FOUND';
  }
  assert.strictEqual(selectRes.rows.length, 1);

  return selectRes.rows[0].claim_response;
}

async function insertAndSelectHookin(
  hookin: hi.Hookin,
  resp: hi.AcknowledgedClaimResponse
): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const hookinHash = hookin.hash().toBech();

  await pool.query(
    `INSERT INTO hookins(hash, claim_response, hookin)
    SELECT $1, $2, $3
    WHERE NOT EXISTS (SELECT 1 FROM hookins WHERE hash = $1)
    RETURNING claim_response`,
    [hookinHash, resp.toPOD(), hookin.toPOD()]
  );

  const res = await pool.query(
    `
    SELECT claim_response from hookins WHERE hash = $1
  `,
    [hookinHash]
  );

  assert.strictEqual(res.rows.length, 1);

  return res.rows[0].claim_response;
}
