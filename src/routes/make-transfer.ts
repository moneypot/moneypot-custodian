import * as assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';

export default async function makeTransfer(body: any): Promise<string> {
  const transfer = hi.BitcoinTransfer.fromPOD(body);
  if (transfer instanceof Error) {
    throw transfer;
  }

  if (!transfer.isValid()) {
    throw 'INVALID_TRANSFER';
  }

  const hookout = transfer.output;

  const actualFee = transfer.fee();
  const feeRate = actualFee / hi.Params.templateTransactionWeight;

  if (feeRate < 0.25) {
    throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
  }

  const send = {
    hookout,
    transaction: await rpcClient.createTransaction(hookout.bitcoinAddress, hookout.amount, feeRate),
  };

  const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(
    transfer.prune(),
    hi.Params.acknowledgementPrivateKey
  );

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, ackTransfer);
    if (insertRes === 'ALREADY_EXISTS') {
      // already exists, so just return the ack...
      return;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertTransactionHookout(dbClient, send.hookout, send.transaction);
  });

  if (send) {
    rpcClient.sendRawTransaction(send.transaction.hex).catch(err => {
      console.error('[INTERNAL_ERROR] [ACTION_REQUIRED] could not send transaction: ', send, ' got: ', err);
    });
  }

  return ackTransfer.acknowledgement.toPOD();
}
