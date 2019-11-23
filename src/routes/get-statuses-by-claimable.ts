import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

export default async function getStatusesByClaimable(url: string) {
  const hash = url.substring('/statuses-by-claimable/'.length);

  const h = hi.Hash.fromPOD(hash);
  if (h instanceof Error) {
    throw 'INVALID_HASH';
  }

  const { rows } = await pool.query(`SELECT status FROM statuses WHERE status->>'claimableHash' = $1`, [hash]);

  return rows.map((row: any) => row['status'] as hi.POD.Status & hi.POD.Acknowledged);
}
