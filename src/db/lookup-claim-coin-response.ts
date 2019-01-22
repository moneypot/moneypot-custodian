import * as assert from "assert";
import * as hi from "hookedin-lib"
import { pool } from "./util";


// possibly throws 'NO_SUCH_COIN' or 'WRONG_MAGNITUDE' if claimant/magnitude doesnt exist
// if the coin hasn't been claimed, returns undefined  otherwise the AcknowledgedClaimResponse
export default async function(coin: hi.ClaimableCoin): Promise<hi.AcknowledgedClaimResponse | undefined> {
    
    const searchRes = await pool.query(`SELECT magnitude,
        request_blinding_nonce, request_blinded_owner, request_authorization,
        response_blinded_existence_proof, response_acknowledgement
        FROM claimable_coins WHERE claimant = $1`, [coin.claimant.toBech()]);

    if (searchRes.rows.length === 0) {
        throw "NO_SUCH_COIN";
    }
    assert.strictEqual(searchRes.rows.length, 1);
    const row = searchRes.rows[0];

    if (row.magnitude !== coin.magnitude) {
        throw "WRONG_MAGNITUDE";
    }

    if (!row['request_blinding_nonce']) {
        return undefined;
    }

    const blindNonce = hi.PublicKey.fromBech(row['request_blinding_nonce']);
    const blindedOwner = hi.BlindedMessage.fromBech(row['request_blinded_owner']);
    const authorization = hi.Signature.fromBech(row['request_authorization']);

    const claimRequest = new hi.ClaimRequest(coin, blindNonce, blindedOwner, authorization);

    
    const blindedExistenceProof = hi.BlindedSignature.fromBech(row['response_blinded_existence_proof']);
    const claimResponse = new hi.ClaimResponse(claimRequest, blindedExistenceProof);
    
    const acknowledgement = hi.Signature.fromBech(row['response_acknowledgement']);
    const acknowledged: hi.AcknowledgedClaimResponse = new hi.Acknowledged(claimResponse, acknowledgement);

    return acknowledged;
}