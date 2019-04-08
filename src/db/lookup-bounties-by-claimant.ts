import * as hi from 'hookedin-lib';

import { pool } from './util';


export default async function(claimant: string): Promise<hi.POD.Bounty[]> {

  const res = await pool.query(`SELECT bounty FROM bounties WHERE bounty->>'claimant' = $1
    ORDER BY claim_response IS NULL DESC LIMIT 100`,
    [claimant]
  );

  return res.rows.map((row: any) => row.bounty);
}
