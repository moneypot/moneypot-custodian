import * as hi from 'hookedin-lib';
import { pool } from '../db/util';

export default async function(url: string) {
  const owner = url.substring('/coin/'.length);

  const o = hi.PublicKey.fromPOD(owner);
  if (o instanceof Error) {
    throw 'INVALID_OWNER';
  }

  const res = await pool.query(`SELECT transfer_hash FROM transfer_inputs WHERE owner = $1`, [owner]);

  if (res.rows.length === 0) {
    return undefined;
  }

  return res.rows[0].transfer_hash as string;
}
