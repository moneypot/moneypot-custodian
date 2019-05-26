import * as assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';

// expects a { transfer, hookout }
export default async function makeTransfer(body: any): Promise<string> {
  if (typeof body !== 'object') {
    throw 'expected object of {transfer,hookout}';
  }

  const transfer = hi.Transfer.fromPOD(body.transfer);
  if (transfer instanceof Error) {
    throw transfer;
  }
  
  if (!transfer.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const hookout = hi.Hookout.fromPOD(body.hookout);
  if (hookout instanceof Error) {
    throw hookout;
  }

  const actualFee = transfer.inputAmount() - (transfer.change.amount + hookout.amount);
  const feeRate = actualFee / hi.Params.templateTransactionWeight;

  if (feeRate < 0.25) {
    throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
  }

  const sendTransaction = await rpcClient.createTransaction(hookout.bitcoinAddress, hookout.amount, feeRate);

  const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(
    transfer,
    hi.Params.acknowledgementPrivateKey
  );

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, ackTransfer);
    if (insertRes === 'ALREADY_EXISTS') {
      // already exists, so just return the ack...
      return;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertTransactionHookout(dbClient, hookout, sendTransaction);
  });

    rpcClient.sendRawTransaction(sendTransaction.hex).catch(err => {
      console.error('[INTERNAL_ERROR] [ACTION_REQUIRED] could not send transaction: ', sendTransaction, ' got: ', err);
    });
  

  return ackTransfer.acknowledgement.toPOD();
}
