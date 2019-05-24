import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

export default async function(hash: string): Promise<hi.Hookin | undefined> {

  const res = await pool.query(`SELECT hookin FROM hookins WHERE hash = $1`, [hash]);

  if (res.rows.length === 0) {
    return undefined;
  }

  assert.strictEqual(res.rows.length, 1);
  const hookin = hi.Hookin.fromPOD(res.rows[0].hookin);
  if (hookin instanceof Error) {
    throw hookin;
  }

  return hookin;
}
