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

  if (hi.Buffutils.compare(hookout.hash().buffer, transfer.outputHash.buffer) !== 0) {
    throw 'hookout does not match transfer';
  }

  const actualFee = transfer.inputAmount() - (transfer.change.amount + hookout.amount);
  const feeRate = actualFee / hi.Params.templateTransactionWeight;

  if (feeRate < 0.25) {
    throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
  }

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, transfer);
    if (insertRes === 'ALREADY_EXISTS') {
      throw insertRes;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertHookout(dbClient, hookout);
  });

  let sendTransaction: rpcClient.CreateTransactionResult;
  try {
    sendTransaction = await rpcClient.createSmartTransaction(hookout.bitcoinAddress, hookout.amount, feeRate);
  } catch (err) {
    console.warn(
      'could not create the transaction, got: ',
      hookout.bitcoinAddress,
      hookout.amount,
      feeRate,
      ' error: ',
      err
    );

    await withTransaction(async dbClient => {
      await dbTransfer.removeTransfer(dbClient, transfer.hash().toPOD());
      await dbTransfer.removeHookout(dbClient, hookout.hash().toPOD());
    });

    throw err;
  }

  rpcClient.sendRawTransaction(sendTransaction.hex).catch(err => {
    console.error(
      '[INTERNAL_ERROR] [ACTION_REQUIRED] might not be able to have sent transaction: ',
      sendTransaction,
      ' got: ',
      err
    );
  });

  const acknowledgement = hi.Signature.compute(transfer.hash().buffer, hi.Params.acknowledgementPrivateKey);

  await dbTransfer.ackTransfer(transfer.hash().toPOD(), acknowledgement.toPOD());

  return acknowledgement.toPOD();
}
