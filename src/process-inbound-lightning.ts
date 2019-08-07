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
    const { rows } = await db.pool.query(`SELECT hash, claimable FROM claimables WHERE hash = (
        SELECT claimable_hash FROM statuses WHERE status->>'kind' = 'InvoiceSettled' ORDER BY created DESC LIMIT 1
      )`);


    if (rows.length === 1) {
      const claimable = hi.podToClaimable(rows[0].claimable);
      if (claimable instanceof Error) {
        throw claimable;
      }
      if (!(claimable.contents instanceof hi.LightningInvoice)) {
        throw new Error('expected a lightning invoice, for claimable hash: ' + rows[0].hash);
      }

      const { tags } = hi.decodeBolt11(claimable.contents.paymentRequest);
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
        `SELECT hash FROM claimables
          WHERE claimable->>'kind' = 'LightningInvoice' AND claimable->>'paymentRequest' = $1`,
        [lndInvoice.payment_request]
      );

      if (rows.length !== 1) {
        console.warn('Could not find invoice with payment_request of: ', lndInvoice.payment_request);
        return;
      }

      const invoiceHash = rows[0].hash as string;

      console.log(
        'Marking invoice ',
        invoiceHash,
        ' as paid: ',
        lndInvoice.amt_paid_sat,
        'sats #',
        lndInvoice.settle_index
      );

      await insertStatus(invoiceHash, { kind: 'InvoiceSettled',
        settlement: {
          amount: lndInvoice.amt_paid_sat,
          rPreimage: lndInvoice.r_preimage.toString('hex'),
          time: new Date(lndInvoice.settle_date * 1000)
        }
      });

    });

    console.log('[lnd] subscribe failed, restarting');

  }
}
