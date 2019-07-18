import * as hi from 'hookedin-lib';
import * as lightning from '../lightning/index';

import * as db from '../db/util';
import { ackSecretKey } from '../custodian-info';

export default async function addInvoice(body: any) {
  if (typeof body !== 'object') {
    throw 'expected object for add invoice';
  }

  const beneficary = hi.PublicKey.fromPOD(body.beneficary);
  if (beneficary instanceof Error) {
    throw 'expected a public key beneficary';
  }

  const memo = body.memo;
  if (typeof memo !== 'string') {
    throw 'expected a string for memo';
  }

  const value = body.value;
  if (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value)) {
    throw 'expected an natural number for value';
  }

  const [invoice, rHash] = await lightning.addInvoice(beneficary, memo, value);

  const ackedInvoice: hi.AcknowledgedLightningInvoice = hi.Acknowledged.acknowledge(invoice, ackSecretKey);

  const ackedPOD = ackedInvoice.toPOD();

  await db.pool.query(
    `INSERT INTO lightning_invoices(hash, lightning_invoice, r_hash)
    VALUES($1, $2, $3)
  `,
    [ackedInvoice.hash().toPOD(), ackedPOD, rHash]
  );

  return ackedPOD;
}

(async function() {
  const pub = hi.PrivateKey.fromRand().toPublicKey();

  const details = { beneficary: pub.toPOD(), memo: 'autogen', value: Math.floor(Math.random() * 50000) };

  console.log('new invoice is: ', await addInvoice(details));
})();
