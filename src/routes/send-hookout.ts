import assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction, pool } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';
import * as dbStatus from '../db/status';

import { fundingSecretKey } from '../custodian-info';
import { templateTransactionWeight } from '../config';
import { ackSecretKey } from '../custodian-info';

export default async function sendHookout(body: any) {
  const hookout = hi.Hookout.fromPOD(body);
  if (hookout instanceof Error) {
    throw hookout;
  }

  if (!hookout.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const feeRate = hookout.fee / templateTransactionWeight;

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
      expectedFee = 0;
      break;
    case 'CUSTOM':
      if (feeRate < 0.25) {
        throw 'fee was ' + feeRate + ' but require a feerate of at least 0.25';
      }
      expectedFee = hookout.fee;
      break;
    default:
      let _never: never = hookout.priority;
      throw new Error('unexpected priority');
  }

  if (hookout.fee !== expectedFee) {
    console.warn('Got fee of: ', hookout.fee, ' but expected: ', expectedFee);
    throw 'WRONG_FEE_RATE';
  }

  const hookoutHashStr = hookout.hash().toPOD();

  const ackdHookout = hi.Acknowledged.acknowledge(hookout, ackSecretKey);

  const insertRes = await dbTransfer.insertTransfer(ackdHookout);
  if (insertRes !== 'SUCCESS') {
    throw insertRes;
  }

  // If we're going to send right now, lets get some others...
  if (hookout.priority === 'IMMEDIATE' || hookout.priority === 'FREE') {
    await withTransaction(async dbClient => {
      let otherHookouts: hi.Hookout[] = [];

      const queryRes = await dbClient.query(
        `SELECT claimable FROM claimables WHERE claimable->>'kind' = 'Hookout'
        AND claimable->>'priority' = $1
        AND hash NOT IN (SELECT claimable_hash FROM statuses)
        FOR UPDATE
        `,
        [hookout.priority === 'IMMEDIATE' ? 'BATCH' : 'FREE']
      );

      for (const { claimable } of queryRes.rows) {
        const h = hi.Hookout.fromPOD(claimable);
        if (h instanceof Error) {
          throw h;
        }

        otherHookouts.push(h);
      }

      // If not a batch...
      if (hookout.priority !== 'BATCH') {
        const noChange = hookout.priority === 'FREE';

        let sendTransaction = await rpcClient.createSmartTransaction(hookout, otherHookouts, feeRate, noChange);
        if (sendTransaction instanceof Error) {
          console.warn(
            'could not create the transaction, to: ',
            { hookout: hookout.toPOD(), otherHookouts: otherHookouts.map(h => h.toPOD), feeRate, noChange },
            'got error: ',
            sendTransaction
          );

          await dbStatus.insertStatus(
            hookoutHashStr,
            { kind: 'HookoutFailed', error: sendTransaction.message },
            dbClient
          );
          return;
        }

        await dbClient.query(
          `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
      VALUES($1, $2, $3, 'SENDING')
    `,
          [sendTransaction.txid, sendTransaction.hex, sendTransaction.fee]
        );

        // TODO: can be flattened into a single query
        for (const hookout of sendTransaction.allOutputs) {
          await dbStatus.insertStatus(
            hookout.hash().toPOD(),
            { kind: 'HookoutSucceeded', txid: sendTransaction.txid },
            dbClient
          );
        }

        // actually send in the background
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
    });
  }

  return ackdHookout.toPOD();
}
