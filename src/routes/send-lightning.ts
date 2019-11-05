import * as hi from 'hookedin-lib';
import * as assert from 'assert';

import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import * as lightning from '../lightning';

import StatusFailed from 'hookedin-lib/dist/status/failed';
import StatusLightningPaymentSent from 'hookedin-lib/dist/status/lightning-payment-sent';
import StatusInvoiceSettled from 'hookedin-lib/dist/status/invoice-settled';

import { pool, withTransaction } from '../db/util';

export default async function sendLightning(payment: hi.LightningPayment) {
  if (payment.fee < 100) {
    throw 'min fee is 100 satoshis..';
  }

  const insertRes = await dbTransfer.insertTransfer(payment);
  if (insertRes === 'DOUBLE_SPEND') {
    throw insertRes;
  }
  const [ackClaimable, isNew] = insertRes;

  if (isNew) {
    // we send here in the background
    sendPayment(payment).catch(err => {
      console.error('[INTERNAL_ERROR] when sending lightning in the background: ', err);
    });
  }

  return ackClaimable.toPOD();
}

async function sendPayment(payment: hi.LightningPayment) {
  // First we are going to check if it's an internal send
  const internalRes = await withTransaction(async client => {
    // we just use FOR UPDATE as a poor mans lock
    const { rows } = await client.query(
      `
      SELECT claimable FROM claimables
        WHERE claimable->>'kind' = 'LightningInvoice'
        AND claimable->>'paymentRequest' = $1
      FOR UPDATE  
      `,
      [payment.paymentRequest]
    );

    if (rows.length !== 1) {
      return 'NOT_INTERNAL';
    }

    const claimable = rows[0].claimable;

    // Now make sure it's not already paid...
    const countRes = await client.query(
      `
      SELECT COUNT(*) as count FROM statuses
      WHERE status->>'kind'='InvoiceSettled' AND status->>'claimableHash' = $1
    `,
      [claimable.hash]
    );

    if (countRes.rows[0].count !== 0) {
      return new Error('INVOICE_ALREADY_PAID');
    }

    const cancelErr = await lightning.cancelInvoiceByPaymentRequest(payment.paymentRequest);
    if (cancelErr) {
      console.warn('warning: could not cancel invoice, got: ', cancelErr);
      return new Error('COULD_NOT_CANCEL_EXISTING_INVOICE');
    }

    const invoice = hi.claimableFromPOD(claimable);
    if (!(invoice instanceof hi.LightningInvoice)) {
      throw new Error(
        'assertion failure: expected a lightning invoice, got something else for ' + payment.paymentRequest
      );
    }

    // Let's look it up, so we can find hte preimage
    const lndInvoice = await lightning.lookupInvoicebyPaymentRequest(invoice.paymentRequest);
    if (!lndInvoice) {
      throw new Error('could not lookup settled invoice');
    }

    // Ok, we're going to fake a transfer
    const settleTime = new Date();
    const settleStatus = new StatusInvoiceSettled(invoice.hash(), payment.amount, lndInvoice.r_preimage, settleTime);

    const fee = 100;

    const paymentStatus = new StatusLightningPaymentSent(payment.hash(), lndInvoice.r_preimage, fee);

    await dbStatus.insertStatus(paymentStatus, client);
    await dbStatus.insertStatus(settleStatus, client);
  });

  let err;

  if (internalRes === 'NOT_INTERNAL') {
    const sendRes = await lightning.sendPayment(payment);
    if (!sendRes.payment_error) {
      const status = new StatusLightningPaymentSent(
        payment.hash(),
        sendRes.payment_preimage,
        sendRes.payment_route.total_fees
      );
      await dbStatus.insertStatus(status);
    } else {
      err = new Error(sendRes.payment_error);
    }
  } else {
    err = internalRes;
  }

  if (err) {
    const status = new StatusFailed(payment.hash(), err.message, payment.fee);
    await dbStatus.insertStatus(status);
  }
}
