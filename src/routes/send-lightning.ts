import * as hi from 'hookedin-lib';
import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import { ackSecretKey } from '../custodian-info';
import * as lightning from '../lightning';

export default async function sendLightning(body: any): Promise<hi.POD.LightningPayment & hi.POD.Acknowledged> {
  const payment = hi.LightningPayment.fromPOD(body);
  if (payment instanceof Error) {
    throw 'send lightning expected a valid lightning payment';
  }

  if (!payment.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const potentialFee = payment.inputAmount() - payment.amount;
  if (potentialFee < 100) {
    throw 'min fee is 100 satoshis..';
  }

  const ackdPayment: hi.Acknowledged.LightningPayment = hi.Acknowledged.acknowledge(payment, ackSecretKey);

  const insertRes = await dbTransfer.insertTransfer(ackdPayment);
  if (insertRes !== 'SUCCESS') {
    throw insertRes;
  }

  (async function() {
    // send in the background
    const sendRes = await lightning.sendPayment(payment, potentialFee);
    if (sendRes instanceof Error) {
      if (sendRes.message === 'SPECIFIC_KNOWN_ERROR') {
        // TODO: this properly...
        await dbStatus.insertStatus(payment.hash().toPOD(), { kind: 'LightningPaymentFailed' });
      }

      console.error(
        'INTERNAL_ERROR lightning payment: ',
        payment.hash().toPOD(),
        ' is in unknown state. Got error: ',
        sendRes
      );
      return;
    }

    await dbStatus.insertStatus(payment.hash().toPOD(), { kind: 'LightningPaymentSucceeded', result: sendRes });
  })();

  return ackdPayment.toPOD();
}
