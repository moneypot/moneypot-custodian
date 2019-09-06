import assert from 'assert';
import * as hi from 'hookedin-lib';
import * as lightning from './lightning/index';
import * as db from './db/util';
import { insertStatus } from './db/status';

export default async function processInboundLightning() {
  while (true) {
    let lastSettleIndex = 0;

    // To find the ~last settledInvoice, we're going to search for the last invoice in our db that was settled
    // then look it up
    const { rows } = await db.pool.query(`SELECT claimable FROM claimables WHERE claimable->>'hash' = (
        SELECT status->>'claimableHash' FROM statuses WHERE status->>'kind' = 'InvoiceSettled' ORDER BY created DESC LIMIT 1
      )`);

    if (rows.length === 1) {
      const invoice = hi.LightningInvoice.fromPOD(rows[0].claimable);
      if (invoice instanceof Error) {
        throw invoice;
      }

      const { tags } = hi.decodeBolt11(invoice.paymentRequest);
      for (const tag of tags) {
        if (tag.tagName === 'payment_hash') {
          const lndInvoice = await lightning.lookupInvoice(tag.data as string);
          lastSettleIndex = lndInvoice.settle_index;
        }
      }
    }
    assert(Number.isSafeInteger(lastSettleIndex));

    console.log('Going to subscribe to invoices. Highest processed is: ', lastSettleIndex);

    await lightning.subscribeSettledInvoices(lastSettleIndex, async lndInvoice => {
      const { rows } = await db.pool.query(
        `SELECT claimable->>'hash' as hash FROM claimables
          WHERE claimable->>'kind' = 'LightningInvoice' AND claimable->>'paymentRequest' = $1`,
        [lndInvoice.payment_request]
      );

      if (rows.length !== 1) {
        console.warn('Could not find invoice with payment_request of: ', lndInvoice.payment_request);
        return;
      }

      const invoiceHash = hi.Hash.fromPOD(rows[0].hash);
      if (invoiceHash instanceof Error) {
        throw invoiceHash;
      }

      console.log(
        'Marking invoice ',
        invoiceHash,
        ' as paid: ',
        lndInvoice.amt_paid_sat,
        'sats #',
        lndInvoice.settle_index
      );

      const status = new hi.Status(
        new hi.StatusInvoiceSettled(
          invoiceHash,
          lndInvoice.amt_paid_sat,
          lndInvoice.r_preimage,
          new Date(lndInvoice.settle_date * 1000)
        )
      );

      await insertStatus(status);
    });

    console.log('[lnd] subscribe failed, restarting');
  }
}
