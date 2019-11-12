import * as hi from 'hookedin-lib';

import { pool } from '../db/util';

export default async function lightningInvoiceByClaimant(url: string) {
  const claimantStr = url.substring('/lightning-invoices-by-claimant/'.length);

  const claimant = hi.PublicKey.fromPOD(claimantStr);
  if (claimant instanceof Error) {
    throw 'INVALID_CLAIMANT';
  }

  const { rows } = await pool.query(`SELECT claimable FROM claimables WHERE (lightning_invoice->>'claimant') = $1`, [
    claimantStr,
  ]);

  return rows.map(row => row.claimable as hi.POD.LightningInvoice & hi.POD.Acknowledged)
}
