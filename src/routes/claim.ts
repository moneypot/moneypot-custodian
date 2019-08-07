import * as hi from 'hookedin-lib';

import * as nonceLookup from '../util/nonces';
import { blindingSecretKeys, ackSecretKey } from '../custodian-info';


import { pool, withTransaction } from '../db/util';

import * as assert from 'assert';
import { insertStatus } from '../db/status';

export default async function claim(body: any) {
  const claimRequest = hi.ClaimRequest.fromPOD(body);
  if (claimRequest instanceof Error) {
    throw claimRequest;
  }

  const claimHash = claimRequest.claimHash.toPOD();

  return withTransaction(async client => {
    let claimant;

    {
      // First we need to know what's being claimed (so we can get the claimant)
      const {
        rows,
      } = await client.query(`SELECT transfer->>'claimant' AS claimant WHERE hash = $1 FROM transfers FOR UPDATE
        UNION ALL
        SELECT hookin->>'claimant' AS claimant FROM hookins WHERE hash = $1 FOR UPDATE
        UNION ALL
        SELECT lightning_invoice->>'claimant' AS claimant FROM lightning_invoices WHERE hash = $1 FOR UPDATE
      `);

      if (rows.length !== 1) {
        throw 'claimable hash not found';
      }

      claimant = hi.PublicKey.fromPOD(rows[0]['claimant']);
      if (claimant instanceof Error) {
        throw claimant;
      }
    }

    const { rows } = await client.query(`SELECT status FROM statuses WHERE source_hash = $1`, [claimHash]);

    let toClaim = 0;
    for (const row of rows) {
      const status: hi.Status.All = row['status'];
      switch (status.kind) {
        case 'FeebumpFailed':
        case 'FeebumpSucceeded':
        case 'LightningPaymentFailed':
        case 'LightningPaymentSucceeded':
        case 'Claimed':
          break;
        default:
          // const _: never = status;
          throw new Error('unknown status: ' + status);
      }
    }

    if (toClaim < 0) {
      throw new Error('somehow more was claimed than should have been allowed: ' + claimHash);
    }
    if (toClaim === 0 || toClaim !== claimRequest.amount()) {
      throw 'WRONG_CLAIM_AMOUNT';
    }

    if (!claimRequest.authorization.verify(claimRequest.hash().buffer, claimant)) {
      throw 'AUTHORIZATION_FAIL';
    }

    const { coinRequests } = claimRequest;

    const blindingNonces = coinRequests.map(coin => coin.blindingNonce.toPOD());

    const secretNonces = nonceLookup.pull(blindingNonces);

    assert.strictEqual(coinRequests.length, secretNonces.length);

    const blindedExistenceProofs = [];

    for (let i = 0; i < secretNonces.length; i++) {
      const secretNonce = secretNonces[i];
      const coinReq = coinRequests[i];

      const blindedExistenceProof = hi.blindSign(
        blindingSecretKeys[coinReq.magnitude.n],
        secretNonce,
        coinReq.blindedOwner
      );

      blindedExistenceProofs.push(blindedExistenceProof);
    }

    const ackClaimResponse: hi.Acknowledged.ClaimResponse = hi.Acknowledged.acknowledge(
      new hi.ClaimResponse(claimRequest, blindedExistenceProofs),
      ackSecretKey
    );

    const newStatus = {
      kind: 'Claimed' as 'Claimed',
      claim: ackClaimResponse.toPOD(),
      amount: toClaim,
    };

    await insertStatus(claimHash, newStatus, client);

    return newStatus;
  });
}
