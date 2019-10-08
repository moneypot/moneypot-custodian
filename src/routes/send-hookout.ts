import * as hi from 'hookedin-lib';
import StatusBitcoinTransactionSent from 'hookedin-lib/dist/status/bitcoin-transaction-sent';
import StatusFailed from 'hookedin-lib/dist/status/failed';

import { withTransaction, pool } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';
import * as dbStatus from '../db/status';

import calcFeeSchedule from './fee-schedule';

export default async function sendHookout(hookout: hi.Hookout) {
  if (!hookout.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const feeSchedule = await calcFeeSchedule();

  let expectedFee;
  switch (hookout.priority) {
    case 'IMMEDIATE':
      expectedFee = feeSchedule.immediate;
      break;
    case 'BATCH':
      expectedFee = feeSchedule.batch;
      break;
    case 'FREE':
      if (hookout.amount < 0.01e8) {
        throw 'min send with free transaction is 0.01 btc!';
      }
      expectedFee = 0;
      break;
    case 'CUSTOM':
      if (hookout.fee < 141) {
        throw 'fee was ' + hookout.fee + ' but require a feerate of at least 141';
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

  const hookoutHash = hookout.hash();

  const insertRes = await dbTransfer.insertTransfer(hookout);
  if (!(insertRes instanceof hi.Acknowledged.default)) {
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

        let sendTransaction = await rpcClient.createSmartTransaction(hookout, otherHookouts, feeSchedule.immediateFeeRate, noChange);
        if (sendTransaction instanceof Error) {
          console.warn(
            'could not create the transaction, to: ',
            { hookout: hookout.toPOD(), otherHookouts: otherHookouts.map(h => h.toPOD), feeRate: feeSchedule.immediateFeeRate, noChange },
            'got error: ',
            sendTransaction
          );

          const status = new StatusFailed(hookoutHash, sendTransaction.message, hookout.fee);
          await dbStatus.insertStatus(status, dbClient);
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
          const status = new StatusBitcoinTransactionSent(hookout.hash(), sendTransaction.txid);
          await dbStatus.insertStatus(status, dbClient);
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

  return insertRes.toPOD();
}
