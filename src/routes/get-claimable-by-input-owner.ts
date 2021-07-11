import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

export default async function getClaimableByInputOwner(url: string) {
  const owner = url.substring('/claimable-by-input-owner/'.length);

  const o = hi.PublicKey.fromPOD(owner);
  if (o instanceof Error) {
    throw 'INVALID_OWNER';
  }

  const {
    rows,
  } = await pool.query(
    `SELECT claimable, created FROM claimables WHERE claimable->>'hash' = (SELECT transfer_hash FROM transfer_inputs WHERE owner = $1)`,
    [owner]
  );
  if (rows.length === 0) {
    return null;
  }
  let c = rows[0].claimable as hi.POD.Claimable & hi.POD.Acknowledged;
  c.initCreated = Math.round(rows[0].created / 60000) * 60000;

  return c;
}
