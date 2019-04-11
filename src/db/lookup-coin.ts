import assert from 'assert';

import { pool } from './util';

export default async function(owner: string): Promise<string | undefined> {
  const res = await pool.query(`SELECT transfer_hash FROM transfer_inputs WHERE owner = $1`, [owner]);

  if (res.rows.length === 0) {
    return undefined;
  }

  assert.strictEqual(res.rows.length, 1);
  return res.rows[0].transfer_hash as string;
}
