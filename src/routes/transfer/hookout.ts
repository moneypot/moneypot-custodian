//coin to hookout

import assert from 'assert';
import * as config from '../../config';
import * as hi from 'hookedin-lib';
import * as rpcClient from '../../util/rpc-client';

import * as dbTransfer from '../../db/transfer';
import { withTransaction, pool } from '../../db/util';

// returns an ack
export default async function(body: any): Promise<string> {
  const transfer = hi.TransferHookout.fromPOD(body);
  if (transfer instanceof Error) {
    throw transfer;
  }

  const transferHash = transfer.hash().toBech();

  if (!transfer.output.immediate) {
    throw 'non-immediate hookouts not yet supported ;(';
  }

  const actualFee = transfer.input.amount - transfer.output.amount;
  const feeRate = actualFee / hi.Params.templateTransactionWeight;

  if (feeRate < 0.25) {
    throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
  }

  let txRes = await rpcClient.createTransaction(transfer.output.bitcoinAddress, transfer.output.amount, feeRate);

  const ackTransfer: hi.AcknowledgedTransferHookout = hi.Acknowledged.acknowledge(
    transfer,
    hi.Params.acknowledgementPrivateKey
  );

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(
      dbClient,
      transferHash,
      transfer.input.hash(),
      transfer.output.hash(),
      transfer.authorization,
      ackTransfer.acknowledgement
    );
    if (insertRes === 'TRANSFER_ALREADY_EXISTS') {
      return;
    } else if (insertRes === 'TRANSFER_INPUT_ALREADY_EXISTS') {
      throw insertRes;
    } else {
      const _: undefined = insertRes;
    }

    const spir = await dbTransfer.insertSpentCoins(dbClient, transferHash, transfer.input);
    if (spir === 'COIN_ALREADY_SPENT') {
      throw spir;
    } else {
      const _: undefined = spir;
    }

    await dbTransfer.insertTransactionHookout(dbClient, transferHash, transfer.output, txRes);
  });

  rpcClient.sendRawTransaction(txRes!.hex).catch(err => {
    console.error('[INTERNAL_ERROR] [ACTION_REQUIRED] could not send transaction: ', txRes, ' got: ', err);
  });

  return ackTransfer.acknowledgement.toBech();
}
