import assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction, pool } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';

import { fundingSecretKey } from '../custodian-info';
import { templateTransactionWeight } from '../config'

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
  if (actualFee < 0) {
    throw new Error('not possible to create a transfer with negative fee...');
  }

  const feeRate = actualFee / templateTransactionWeight;

  const immediateFeeRate = await rpcClient.getImmediateFeeRate();

  let expectedFee;
  switch (hookout.priority) {
    case 'IMMEDIATE':
      expectedFee = Math.round(immediateFeeRate * templateTransactionWeight);
      break;
    case 'BATCH':
      expectedFee = Math.round(immediateFeeRate * 32); // TODO: factor 32 out (it's the size of an output..)
      break;
    case 'FREE':
      if (hookout.amount < 0.01e8) {
        throw 'min send with free transaction is 0.01 btc!';
      }
      if (actualFee !== 0) {
        throw 'free fees should be 0';
      }
      expectedFee = 0;
      break;
    case 'CUSTOM':
      if (feeRate < 0.25) {
        throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
      }
      expectedFee = actualFee;
      // We're going to lave the feeRate as 0, as that's a magic value to mean use consolidation
      break;
    default:
      let _never: never = hookout.priority;
      throw new Error('unexpected priority');
  }

  if (actualFee !== expectedFee) {
    console.warn('Got fee of: ', actualFee, ' but expected: ', expectedFee);
    throw 'WRONG_FEE_RATE';
  }

  let otherHookouts: hi.Hookout[] = [];


  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, transfer);
    if (insertRes === 'ALREADY_EXISTS') {
      throw insertRes;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertHookout(dbClient, hookout);

      // If we're going to send right now, lets get some others...
    if (hookout.priority === 'IMMEDIATE' || hookout.priority === 'FREE') {

      const queryRes = await dbClient.query(`SELECT hookout FROM hookouts WHERE
          hookout->>'priority' = $1 AND processed_by IS NULL
        `,
        [hookout.priority === 'IMMEDIATE' ? 'BATCH' : 'FREE']
      );

      for (const { hookout } of queryRes.rows) {
        const h = hi.Hookout.fromPOD(hookout);
        if (h instanceof Error) {
          throw h;
        }

        otherHookouts.push(h);
      }
    }
  });


  // If not a batch...
  if (hookout.priority !== 'BATCH') {
    const noChange = hookout.priority === 'FREE';

    let sendTransaction: rpcClient.CreateTransactionResult;
    try {
      sendTransaction = await rpcClient.createSmartTransaction(hookout, otherHookouts, feeRate, noChange);
    } catch (err) {
      console.warn(
        'could not create the transaction, to: ',
        { hookout: hookout.toPOD(), otherHookouts: otherHookouts.map(h => h.toPOD), feeRate, noChange },
        'got error: ',
        err
      );

      await withTransaction(async dbClient => {
        await dbTransfer.removeTransfer(dbClient, transfer.hash().toPOD());
        await dbTransfer.removeHookout(dbClient, hookout.hash().toPOD());
      });

      if (err === 'NO_SOLUTION_FOUND') {
        throw 'HOT_WALLET_EMPTY';
      }

      throw err;
    }

    await withTransaction(async dbClient => {
      await dbClient.query(
        `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
        VALUES($1, $2, $3, 'SENDING')
      `,
        [sendTransaction.txid, sendTransaction.hex, sendTransaction.fee]
      );

      for (const hookout of sendTransaction.allOutputs) {
        const res = await dbClient.query(
          `UPDATE hookouts SET processed_by = $1 WHERE hash = $2 AND processed_by IS NULL`,
          [sendTransaction.txid, hookout.hash().toPOD()]
        );
        if (res.rowCount !== 1) {
          throw new Error('could not update hookout ');
        }
      }
    });

    // actually send
    (async () => {
      try {
        await rpcClient.sendRawTransaction(sendTransaction.hex);
        await pool.query(`UPDATE bitcoin_transactions SET status = 'SENT' WHERE txid = $1`, [sendTransaction.txid]);
      } catch (err) {
        console.error(
          '[INTERNAL_ERROR] [ACTION_REQUIRED] might not be able to have sent transaction: ',
          sendTransaction,
          ' got: ',
          err
        );
        return;
      }
    })();
  }

  const acknowledgement = hi.Signature.compute(transfer.hash().buffer, fundingSecretKey);

  await dbTransfer.ackTransfer(transfer.hash().toPOD(), acknowledgement.toPOD());

  return acknowledgement.toPOD();
}
