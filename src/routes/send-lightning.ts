import * as hi from 'hookedin-lib';
import * as assert from 'assert';

import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import * as lightning from '../lightning';

export default async function sendLightning(payment: hi.LightningPayment) {

  if (payment.fee < 100) {
    throw 'min fee is 100 satoshis..';
  }


  const insertRes = await dbTransfer.insertTransfer(payment);
  if (!(insertRes instanceof hi.Acknowledged.default)) {
    throw insertRes;
  }

  (async function() {
    // send in the background
    const sendRes = await lightning.sendPayment(payment);
    if (sendRes instanceof Error) {
      if (sendRes.message === 'SPECIFIC_KNOWN_ERROR') {
        const status = new hi.Status(new hi.StatusFailed(payment.hash(), sendRes.message, payment.fee));
        await dbStatus.insertStatus(status);
      }

      console.error(
        'INTERNAL_ERROR lightning payment: ',
        payment.hash().toPOD(),
        ' is in unknown state. Got error: ',
        sendRes
      );
      return;
    }
    assert.strictEqual(sendRes.payment_error, '');

    const status = new hi.Status(new hi.StatusLightningPaymentSent(payment.hash(),sendRes.payment_preimage, sendRes.payment_route.total_fees));
    await dbStatus.insertStatus(status);
  })();

  return insertRes.toPOD();
}
