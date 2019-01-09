import assert from "assert";

import * as hi from "hookedin-lib"
import { pool } from './util';


export default async function(owner: string): Promise<(hi.POD.SpentCoin & hi.POD.TransferHash) | undefined> {

    const res = await pool.query(`
       SELECT owner, transfer_hash, magnitude, existence_proof, spend_proof
       FROM spent_coins WHERE id = $1 
    `, [owner])

    if (res.rows.length === 0) {
        return undefined;
    }

    assert(res.rows.length === 1);
    const row = res.rows[0];

    return {
        existenceProof: row['existence_proof'] as string,
        magnitude: row['magnitude'] as hi.POD.Magnitude,
        owner: row['owner'] as string,
        spendProof: row['spend_proof'] as string,
        transferHash: row['transfer_hash'] as string,
    }
}