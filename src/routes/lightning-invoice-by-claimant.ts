import * as hi from 'moneypot-lib';

import { pool, poolQuery } from '../db/util';

export default async function lightningInvoiceByClaimant(url: string) {
  const claimantStr = url.substring('/lightning-invoices-by-claimant/'.length);

  const claimant = hi.PublicKey.fromPOD(claimantStr);
  if (claimant instanceof Error) {
    throw 'INVALID_CLAIMANT';
  }

  // const { rows } = await pool.query(`SELECT claimable, created FROM claimables WHERE claimable->>'claimant' = $1`, [
  //   claimantStr,
  // ]);
  const { rows } = await poolQuery(`SELECT claimable, created FROM claimables WHERE claimable->>'claimant' = $1`, [
    claimantStr
  ], claimantStr, 'invoice-claimant #1: check invoice by claimant');

  if (rows.length === 0) {
    return null;
  }

  let i = rows[0].claimable as hi.POD.Claimable & hi.POD.Acknowledged;

  i.initCreated = Math.round(rows[0].created / 60000) * 60000;
  return i;
}
