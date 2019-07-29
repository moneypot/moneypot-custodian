import * as hi from 'hookedin-lib';

import { pool } from '../db/util';

export default async function lightningInvoiceByClaimant(url: string) {
  const claimantStr = url.substring('/lightning-invoices/claimants/'.length);

  const claimant = hi.PublicKey.fromPOD(claimantStr);
  if (claimant instanceof Error) {
    throw 'INVALID_CLAIMANT';
  }

  const { rows } = await pool.query(
    `
    SELECT * FROM lightning_invoices WHERE (lightning_invoice->>'claimant') = $1
  `,
    [claimantStr]
  );

  if (rows.length > 1) {
    throw new Error('assertion: duplicate claimants are not allowed');
  }
  if (rows.length === 0) {
    return null;
  }

  return rows[0].lightning_invoice as hi.POD.LightningInvoice & hi.POD.Acknowledged;
}
