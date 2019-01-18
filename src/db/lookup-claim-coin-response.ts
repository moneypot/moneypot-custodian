import * as hi from "hookedin-lib"
import { pool } from "./util";


export default async function(claimRequestHash: hi.Hash) {
    
    const dupeRes = await pool.query(`
        SELECT 
            claimant, magnitude, request_blind_nonce, request_blinded_owner, request_authorization
        response_blinded_existence_proof, response_acknowledgement
        FROM claims JOIN claimable_coins ON claims.claimable_coins_id = claimable_coins.id
        WHERE claims.request_hash = $1
    `, [claimRequestHash.toBech()]);

    if (dupeRes.rows.length === 0) {
        return undefined;
    }

    const row = dupeRes.rows[0];




    const claimant = hi.PublicKey.fromBech(row['claimant']);
    const magnitude = row['magnitude'];
    if (!hi.POD.isMagnitude(magnitude)) {
        throw new Error("assertion: found incorrect magnitude");
    }

    const claimableCoin = new hi.ClaimableCoin(claimant, magnitude);

    const blindNonce = hi.PublicKey.fromBech(row['request_blind_nonce']);

    const blindedOwner = hi.BlindedMessage.fromBech(row['blinded_owner']);

    const authorization = hi.Signature.fromBech(row['request_authorization']);



    const claimRequest = new hi.ClaimRequest(claimableCoin, blindNonce, blindedOwner, authorization);

    
    const blindedExistenceProof = hi.BlindedSignature.fromBech(row['response_blinded_existence_proof']);
    const claimResponse = new hi.ClaimResponse(claimRequest, blindedExistenceProof);
    
    const acknowledgement = hi.Signature.fromBech(row['response_acknowledgement']);
    const acknowledged: hi.AcknowledgedClaimResponse = new hi.Acknowledged(claimResponse, acknowledgement);

    return acknowledged;
}