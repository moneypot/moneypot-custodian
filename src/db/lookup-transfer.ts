import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

type AckedTransfer = hi.POD.Transfer & hi.POD.Acknowledged;

export async function byHash(hash: string): Promise<AckedTransfer | undefined> {
  const res = await pool.query(`SELECT transfer FROM transfers WHERE hash = $1`, [hash]);

  if (res.rows.length === 0) {
    return undefined;
  }

  assert.strictEqual(res.rows.length, 1);

  return res.rows[0].transfer;
}
