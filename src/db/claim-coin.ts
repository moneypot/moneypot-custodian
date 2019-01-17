import * as hi from "hookedin-lib";
import assert from "assert";
import { pool, withTransaction } from "./util";

export default async function(
    claimRequest: hi.ClaimRequest,
    secretNonce: hi.PrivateKey
    ): Promise<hi.AcknowledgedClaimResponse | undefined> {


        return await withTransaction(async (client) => {

            const res = await client.query(`
                SELECT id FROM claimable_coins
                WHERE claimant = $1 AND magnitude = $2
                 AND NOT EXISTS(SELECT 1 FROM claims WHERE claimable_coins.id = claims.claimable_coins_id)
                FOR UPDATE
                LIMIT 1
            `, [claimRequest.claimant.toBech(), claimRequest.magnitude]);

            if (res.rows.length === 0) {
                return undefined;
            }


            const claimRequestHash = claimRequest.hash();

            const claimableCoinsId = res.rows[0].id;


            const blindedExistenceProof = hi.blindSign(
                hi.Params.blindingCoinPrivateKeys[claimRequest.magnitude],
                secretNonce,
                claimRequest.blindedOwner);

            const claimResponse = new hi.ClaimResponse(claimRequest, blindedExistenceProof);
            const ackClaimResponse: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(claimResponse, hi.Params.acknowledgementPrivateKey);

            const insertRes = await client.query(`INSERT INTO claims(claimable_coins_id,
                request_hash, request_blind_nonce, request_blinded_owner, request_authorization,
                response_blinded_existence_proof, response_acknowledgement)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                claimableCoinsId,
                claimRequestHash.toBech(),
                claimRequest.blindNonce.toBech(),
                claimRequest.blindedOwner.toBech(),
                claimRequest.authorization.toBech(),
                claimResponse.blindedExistenceProof.toBech(),
                ackClaimResponse.acknowledgement.toBech(),
            ]);

            assert.strictEqual(insertRes.rowCount, 1);

            return ackClaimResponse;
        
    });



}