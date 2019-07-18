import assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction, pool } from '../db/util';
import * as dbTransfer from '../db/transfer';

import { fundingSecretKey } from '../custodian-info';
import * as lightning from '../lightning';

// expects a { transfer, lightningPayment }
export default async function makeTransfer(body: any): Promise<string> {
  if (typeof body !== 'object') {
    throw 'expected object of {transfer,lightning}';
  }

  const transfer = hi.Transfer.fromPOD(body.transfer);
  if (transfer instanceof Error) {
    throw transfer;
  }

  if (!transfer.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const payment = hi.LightningPayment.fromPOD(body.lightningPayment);
  if (payment instanceof Error) {
    throw payment;
  }

  if (!hi.Buffutils.equal(payment.hash().buffer, transfer.outputHash.buffer)) {
    throw 'hookout does not match transfer';
  }

  const actualFee = transfer.inputAmount() - (transfer.change.amount + payment.amount);
  if (actualFee < 100) {
    throw 'min fee is 100 satoshis..';
  }

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, transfer);
    if (insertRes === 'ALREADY_EXISTS') {
      throw insertRes;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertLightningPayment(dbClient, payment);
  });

  let res;
  try {
    res = await lightning.sendPayment(payment, actualFee);
  } catch (err) {
    if (err === 'SPECIFIC_KNOWN_ERROR') {
      await withTransaction(async dbClient => {
        await dbTransfer.removeLightningPayment(dbClient, payment.hash().toPOD());
        await dbTransfer.removeTransfer(dbClient, transfer.hash().toPOD());
      });

      return 'PAYMENT_FAILURE';
    }

    console.error(
      'INTERNAL_ERROR lightning payment: ',
      payment.hash().toPOD(),
      ' is in unknown state. Got error: ',
      err
    );
  }

  const acknowledgement = hi.Signature.compute(transfer.hash().buffer, fundingSecretKey);

  await dbTransfer.ackTransfer(transfer.hash().toPOD(), acknowledgement.toPOD());

  return acknowledgement.toPOD();
}
