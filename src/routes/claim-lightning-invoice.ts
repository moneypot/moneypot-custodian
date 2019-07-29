import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import ci, { fundingSecretKey } from '../custodian-info';

import dbClaim from '../db/claim';
import { pool } from '../db/util';

// body should be claimRequest
// returns an acknowledgement
export default async function claimLightningInvoice(body: any): Promise<hi.POD.ClaimResponse> {
  const claimReq = hi.ClaimRequest.fromPOD(body);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  const { rows } = await pool.query(`SELECT * FROM lightning_invoices WHERE hash = $1`, [claimReq.claimHash.toPOD()]);
  if (rows.length !== 1) {
    throw 'COULD_NOT_FIND_INVOICE';
  }
  const [row] = rows;

  // it's actually ack'd but we can ignore that
  const invoice = hi.LightningInvoice.fromPOD(row.lightning_invoice);
  if (invoice instanceof Error) {
    throw invoice; // internal error
  }

  if (row.settle_amount !== claimReq.amount()) {
    console.warn('tried to claim: ', claimReq.amount(), ' but should have claimed: ', row.settle_amount);
    throw 'WRONG_CLAIM_AMOUNT';
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, invoice.claimant)) {
    throw 'AUTHORIZATION_FAIL';
  }

  return await dbClaim(claimReq);
}
