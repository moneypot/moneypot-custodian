import * as hi from 'hookedin-lib';
import assert from 'assert';
import { pool } from './util';
import * as nonceLookup from '../util/nonces';

export default async function(claimRequest: hi.ClaimRequest): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const coinRequests = claimRequest.coinRequests;

  const blindingNonces = coinRequests.map(coin => coin.blindingNonce.toPOD());

  const secretNonces = nonceLookup.pull(blindingNonces);

  assert.strictEqual(coinRequests.length, secretNonces.length);

  const blindedExistenceProofs = [];

  for (let i = 0; i < secretNonces.length; i++) {
    const secretNonce = secretNonces[i];
    const coinReq = coinRequests[i];

    const blindedExistenceProof = hi.blindSign(
      hi.Params.blindingCoinPrivateKeys[coinReq.magnitude.n],
      secretNonce,
      coinReq.blindedOwner
    );

    blindedExistenceProofs.push(blindedExistenceProof);
  }

  const ackClaimResponse: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(
    new hi.ClaimResponse(claimRequest, blindedExistenceProofs),
    hi.Params.acknowledgementPrivateKey
  );

  // TODO: insert or in conflict return
  const res = await pool.query(
    `
    INSERT INTO claims(hash, response) VALUES($1, $2) ON CONFLICT(hash) DO NOTHING;
    SELECT response FROM claims WHERE has = $1;
  `,
    [claimRequest.claimHash.toPOD(), ackClaimResponse.toPOD()]
  );

  assert(res.rowCount === 1);

  return res.rows[0]['response'] as hi.POD.Acknowledged & hi.POD.ClaimResponse;
}
