import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

export default async function getClaimable(url: string) {
  const hash = url.substring('/claimables/'.length);

  const h = hi.Hash.fromPOD(hash);
  if (h instanceof Error) {
    throw 'INVALID_HASH';
  }

  const { rows } = await pool.query(`SELECT claimable FROM claimables WHERE claimable->>'hash' = $1`, [hash]);
  if (rows.length === 0) {
    return null;
  }

  return rows[0]['transfer'] as hi.POD.Claimable & hi.POD.Acknowledged;
}
