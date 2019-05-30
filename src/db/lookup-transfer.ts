import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

export async function byHash(hash: string): Promise<hi.POD.Transfer | undefined> {
  const res = await pool.query(`SELECT transfer FROM transfers WHERE hash = $1`, [hash]);

  if (res.rows.length === 0) {
    return undefined;
  }

  assert.strictEqual(res.rows.length, 1);

  return res.rows[0].transfer;
}
