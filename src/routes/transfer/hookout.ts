// import assert from 'assert';
// import * as config from '../../config';
// import * as hi from 'hookedin-lib';
// import * as rpcClient from '../../util/rpc-client';

// import * as dbTransfer from '../../db/transfer';
// import { withTransaction, pool } from '../../db/util';

// // returns an ack
// export default async function(body: any): Promise<string> {
//   const transfer = hi.TransferHookout.fromPOD(body);
//   if (transfer instanceof Error) {
//     throw transfer;
//   }

//   if (!transfer.isValid()) {
//     throw 'INVALID_TRANSFER';
//   }

//   const transferHash = transfer.hash().toPOD();

//   if (!transfer.output.immediate) {
//     throw 'non-immediate hookouts not yet supported ;(';
//   }

//   const actualFee = transfer.input.amount - transfer.output.amount;
//   const feeRate = actualFee / hi.Params.templateTransactionWeight;

//   if (feeRate < 0.25) {
//     throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
//   }

//   let txRes = await rpcClient.createTransaction(transfer.output.bitcoinAddress, transfer.output.amount, feeRate);

//   const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(
//     transfer.prune(),
//     hi.Params.acknowledgementPrivateKey
//   );

//   await withTransaction(async dbClient => {
//     const insertRes = await dbTransfer.insertTransfer(dbClient, ackTransfer);
//     if (insertRes === 'ALREADY_EXISTS') {
//       // already exists, so just return the ack...
//       return;
//     }
//     assert.strictEqual(insertRes, 'SUCCESS');

//     await dbTransfer.insertTransactionHookout(dbClient, transferHash, transfer.output, txRes);
//   });

//   rpcClient.sendRawTransaction(txRes!.hex).catch(err => {
//     console.error('[INTERNAL_ERROR] [ACTION_REQUIRED] could not send transaction: ', txRes, ' got: ', err);
//   });

//   return ackTransfer.acknowledgement.toPOD();
// }
