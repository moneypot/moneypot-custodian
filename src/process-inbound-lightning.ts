import assert from 'assert';
import * as hi from 'moneypot-lib';
import StatusInvoiceSettled from 'moneypot-lib/dist/status/invoice-settled';
import * as lightning from './lightning/index';
import * as db from './db/util';
import { insertStatus } from './db/status';

export default async function processInboundLightning() {
  while (true) {
    const lastSettleIndex = await getLastSettleInvoiceIndex();

    console.log('Going to subscribe to invoices. Highest processed is: ', lastSettleIndex);

    await lightning.subscribeSettledInvoices(lastSettleIndex, async lndInvoice => {
      const { rows } = await db.pool.query(
        `SELECT claimable->>'hash' as hash FROM claimables
          WHERE claimable->>'kind' = 'LightningInvoice' AND claimable->>'paymentRequest' = $1`,
        [lndInvoice.payment_request]
      );

      if (rows.length !== 1) {
        console.warn('warn: could not find invoice with payment_request of: ', lndInvoice.payment_request);
        return;
      }

      const invoiceHash = hi.Hash.fromPOD(rows[0].hash);
      if (invoiceHash instanceof Error) {
        throw invoiceHash;
      }

      console.log(
        'Marking invoice ',
        invoiceHash.toPOD(),
        ' as paid: ',
        lndInvoice.amt_paid_sat,
        'sats #',
        lndInvoice.settle_index
      );

      const status = new StatusInvoiceSettled(
        invoiceHash,
        lndInvoice.amt_paid_sat,
        lndInvoice.r_preimage,
        new Date(lndInvoice.settle_date * 1000)
      );

      await insertStatus(status);
    });

    console.log('[lnd] subscribe failed, restarting');
  }
}

async function getLastSettleInvoiceIndex(before: Date = new Date()): Promise<number> {
  // To find the ~last settledInvoice, we're going to search for the last invoice in our db that was settled
  // then look it up
  const { rows } = await db.pool.query(
    `
      WITH x AS (
        SELECT status->>'claimableHash' as claimableHash, created
        FROM statuses WHERE status->>'kind' = 'InvoiceSettled'
        AND created < $1
        ORDER BY created DESC LIMIT 1
      )
      SELECT claimable, x.created as settled_time FROM claimables, x WHERE claimable->>'hash' = x.claimableHash`,
    [before]
  );

  if (rows.length === 0) {
    return 0;
  }

  const row = rows[0];
  assert(row.settled_time instanceof Date);

  const invoice = hi.LightningInvoice.fromPOD(row.claimable);
  if (invoice instanceof Error) {
    throw invoice;
  }

  console.log('looking up invoice: ', invoice.paymentRequest);

  const lndInvoice = await lightning.lookupInvoicebyPaymentRequest(invoice.paymentRequest);
  if (!lndInvoice) {
    return 0;
  }

  if (lndInvoice.settle_index > 0) {
    return lndInvoice.settle_index;
  } else {
    // because of fake send-to-self it's quite possible it has no settle index
    return getLastSettleInvoiceIndex(row.settled_time);
  }
}
