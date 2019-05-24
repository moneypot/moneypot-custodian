import * as hi from 'hookedin-lib';

import { pool } from './util';

export default async function(claimant: string): Promise<hi.POD.Change[]> {
  const res = await pool.query(
    `SELECT transfer->'change' as change FROM transfers WHERE transfer->'change'->>'claimant' = $1
    ORDER BY change_claim_response IS NULL DESC LIMIT 100`,
    [claimant]
  );

  return res.rows.map((row: any) => row.change);
}
