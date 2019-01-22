import * as hi from "hookedin-lib";
import assert from "assert";
import { pool } from "./util";
import lookupClaimCoinResponse from "./lookup-claim-coin-response";

export default async function(
    claimRequest: hi.ClaimRequest,
    secretNonce: hi.PrivateKey
    ): Promise<hi.AcknowledgedClaimResponse> {

        const blindedExistenceProof = hi.blindSign(
            hi.Params.blindingCoinPrivateKeys[claimRequest.coin.magnitude],
            secretNonce,
            claimRequest.blindedOwner);

        const claimResponse = new hi.ClaimResponse(claimRequest, blindedExistenceProof);
        const ackClaimResponse: hi.AcknowledgedClaimResponse = hi.Acknowledged.acknowledge(claimResponse, hi.Params.acknowledgementPrivateKey);


        // The  COALESCE's here do nothing, but just a extra layer of safety to stop overwriting an entry
        const updateRes = await pool.query(`UPDATE claimable_coins
            SET request_blinding_nonce = COALESCE(request_blinding_nonce, $1),
                request_blinded_owner = COALESCE(request_blinded_owner, $2),
                request_authorization = COALESCE(request_authorization, $3),
                response_blinded_existence_proof = COALESCE(response_blinded_existence_proof, $4),
                response_acknowledgement = COALESCE(response_acknowledgement, $5)
            WHERE claimant = $6 AND magnitude = $7 AND request_blinding_nonce IS NULL
        `, [
            claimRequest.blindingNonce.toBech(),
            claimRequest.blindedOwner.toBech(),
            claimRequest.authorization.toBech(),
            claimResponse.blindedExistenceProof.toBech(),
            ackClaimResponse.acknowledgement.toBech(),
            claimRequest.coin.claimant.toBech(),
            claimRequest.coin.magnitude
        ]);

        // It's possible we were beaten to it, and this coin was race-claimed. So let's check again
        if (updateRes.rowCount === 0) {
            const resp = await lookupClaimCoinResponse(claimRequest.coin);
            if (resp === undefined) {
                throw new Error("something weird, couldnt update coin but couldnt find it either");
            }
            return resp;
        }
        assert.strictEqual(updateRes.rowCount, 1);

        return ackClaimResponse;
}