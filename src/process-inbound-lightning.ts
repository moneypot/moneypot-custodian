import assert from 'assert';
import * as hi from 'hookedin-lib';
import * as lightning from './lightning/index';
import * as db from './db/util';
import { Status, InvoiceSettled } from './status';
import { insertStatus } from './db/status';

export default async function processInboundLightning() {
  while (true) {
    let lastSettleIndex = 0;

    const { rows } = await db.pool.query(
      `SELECT status FROM statuses WHERE status->>'kind' = 'InvoiceSettled' ORDER BY ((status->'lndInvoice'->>'settle_index' ) ) DESC LIMIT 1;`
    );
    if (rows.length === 1) {
      lastSettleIndex = (rows[0].status as InvoiceSettled).lndInvoice.settle_index;
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
        lndInvoice: {
          ...lndInvoice,
          receipt: lndInvoice.receipt.toString('hex'),
          r_preimage: lndInvoice.r_preimage.toString('hex'),
          r_hash: lndInvoice.r_hash.toString('hex'),
          description_hash: lndInvoice.description_hash.toString('hex')
        }

      });

    });

    console.log('[lnd] subscribe failed, restarting');

  }
}
