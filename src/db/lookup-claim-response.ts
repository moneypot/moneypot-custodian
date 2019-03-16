import * as assert from 'assert';
import * as hi from 'hookedin-lib';
import { pool } from './util';


export default async function(bounty: hi.Bounty): Promise<(hi.POD.ClaimResponse & hi.POD.Acknowledged) | undefined> {
  const searchRes = await pool.query(
    `SELECT claim_response
        FROM bounties WHERE hash = $1 AND claim_response IS NOT NULL`,
    [bounty.hash().toBech()]
  );

  if (searchRes.rows.length === 0) {
    return undefined;
  }
  assert.strictEqual(searchRes.rows.length, 1);
  return searchRes.rows[0].claim_response;
}
