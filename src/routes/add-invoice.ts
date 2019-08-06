import * as hi from 'hookedin-lib';
import * as lightning from '../lightning/index';

import * as db from '../db/util';
import { ackSecretKey } from '../custodian-info';

export default async function addInvoice(body: any) {
  if (typeof body !== 'object') {
    throw 'expected object for add invoice';
  }

  const claimant = hi.PublicKey.fromPOD(body.claimant);
  if (claimant instanceof Error) {
    throw 'expected a public key claimant';
  }

  const memo = body.memo;
  if (typeof memo !== 'string') {
    throw 'expected a string for memo';
  }

  const amount = body.amount;
  if (typeof amount !== 'number' || amount < 0 || !Number.isSafeInteger(amount)) {
    throw 'expected an natural number for amount';
  }

  const [invoice, rHash] = await lightning.addInvoice(claimant, memo, amount);

  const ackedInvoice = hi.Acknowledged.acknowledge(invoice, ackSecretKey);

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

  const details = { claimant: pub.toPOD(), memo: 'autogen', amount: Math.floor(Math.random() * 50000) };

  console.log('new invoice is: ', await addInvoice(details));
})();
