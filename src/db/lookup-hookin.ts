import assert from "assert";

import * as hi from "hookedin-lib"
import { pool } from './util';


type HookinInfo =  hi.POD.TransferHash & { spendAuthorization: string }

export default async function(hookinHash: string): Promise<HookinInfo | undefined> {

    const res = await pool.query(`
       SELECT transfer_hash, spend_authorization
       FROM transaction_hookins WHERE hash = $1 
    `, [hookinHash])

    if (res.rows.length === 0) {
        return undefined;
    }

    assert(res.rows.length === 1);
    const row = res.rows[0];

    return {
        spendAuthorization: row['spend_authorization'] as string,
        transferHash: row['transfer_hash'] as string,
    };
}