import * as hi from 'moneypot-lib';
import StatusBitcoinTransactionSent from 'moneypot-lib/dist/status/bitcoin-transaction-sent';
import StatusFailed from 'moneypot-lib/dist/status/failed';

import { withTransaction, pool } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';
import * as dbStatus from '../db/status';

import calcFeeSchedule from './fee-schedule';
import * as config from '.././config';

export default async function sendHookout(hookout: hi.Hookout) {
  if (!hookout.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  // this is client rules... :/ something like 148 (nested segwit, biggest input possible) + 43 (depends on client, but lets assume most costly)
  // Math.ceil((90.75 + 43) * 3)
  if (hookout.amount < 547) {
    throw 'trying to dust up the network. Cannot allow...';
  }
  const addressInfo = hi.decodeBitcoinAddress(hookout.bitcoinAddress);
  if (addressInfo instanceof Error) {
    throw 'trying to send to invalid bitcoin address';
  }
  if (addressInfo.network !== config.network) {
    throw 'bitcoin address from wrong network';
  }

  const feeSchedule = await calcFeeSchedule();
  if (feeSchedule instanceof Error) {
    if (typeof feeSchedule.message === 'string' && /BITCOIN_CORE_NOT_RESPONDING/.test(feeSchedule.message)) {
      throw 'bitcoin core is not responding';
    }
    throw 'Unspecified Error! Try again';
  }

  let expectedFee;
  switch (hookout.priority) {
    case 'IMMEDIATE':
      switch (addressInfo.kind) {
        case 'p2pkh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2pkhTransactionWeight);
          break;
        case 'p2sh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2shp2wpkhTransactionWeight);
          break;
        case 'p2wsh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2wshTransactionWeight);
          break;
        case 'p2wpkh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2wpkhTransactionWeight);
          break;
        case 'p2tr':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2trTransactionWeight);
          break;
      }
      break;
    case 'BATCH':
      switch (addressInfo.kind) {
        case 'p2pkh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2pkh);
          break;
        case 'p2sh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2shp2wpkh);
          break;
        case 'p2wsh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2wsh);
          break;
        case 'p2wpkh':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2wpkh);
          break;
        case 'p2tr':
          expectedFee = Math.ceil(feeSchedule.immediateFeeRate * config.p2tr);
          break;
      }
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

  // TODO: allow for a range of N satoshis so as to account for time
  if (hookout.fee !== expectedFee) {
    console.warn('Got fee of: ', hookout.fee, ' but expected: ', expectedFee);
    throw 'WRONG_FEE_RATE';
  }

  const hookoutHash = hookout.hash();

  const insertRes = await dbTransfer.insertTransfer(hookout);
  if (insertRes === 'NOT_AUTHORIZED_PROPERLY' || insertRes === 'DOUBLE_SPEND' || insertRes === 'CHEATING_ATTEMPT') {
    throw insertRes;
  }
  const [ackClaimable, isNew] = insertRes;

  if (isNew) {
    // actually send...
    // If we're going to send right now, lets get some others...
    if (hookout.priority === 'IMMEDIATE' || hookout.priority === 'CUSTOM' || hookout.priority === 'FREE') {
      await withTransaction(async (dbClient) => {
        let otherHookouts: hi.Hookout[] = [];
        // Batched can never fail, (free can fail only if the custodian crashes and it is the initiator...?)

        //   // we need to lock first
        //  const x =  await dbClient.query(
        //     `SELECT claimable FROM claimables WHERE claimable->>'kind' = 'Hookout' AND claimable->>'priority' = $1 AND (claimable->>'hash') != $2
        //     AND (claimable->>'hash') NOT IN (SELECT (status->>'claimableHash') FROM statuses WHERE (status->>'kind' = 'BitcoinTransactionSent' OR status->>'kind' = 'Failed'))
        //     FOR UPDATE
        //   `,
        //     [
        //       hookout.priority === 'IMMEDIATE' ? 'BATCH' : hookout.priority === 'FREE' ? 'FREE' : undefined,
        //       hookout.toPOD().hash,
        //     ]
        //   );

        //   console.log(x.rows, 'first call')

        // call again
        const queryRes = await dbClient.query(
          `SELECT claimable FROM claimables WHERE claimable->>'kind' = 'Hookout' AND claimable->>'priority' = $1 AND (claimable->>'hash') != $2
          AND (claimable->>'hash') NOT IN (SELECT (status->>'claimableHash') FROM statuses WHERE (status->>'kind' = 'BitcoinTransactionSent' OR status->>'kind' = 'Failed'))
         FOR UPDATE
        `,
          [
            hookout.priority === 'IMMEDIATE' ? 'BATCH' : hookout.priority === 'FREE' ? 'FREE' : undefined,
            hookout.toPOD().hash,
          ]
        );

        for (const { claimable } of queryRes.rows) {
          const h = hi.Hookout.fromPOD(claimable);
          if (h instanceof Error) {
            throw h;
          }
          otherHookouts.push(h);
        }

        // remove this ugly function
        // TODO: query stuck custom/immediate tx in case of uncatched errors?!
        const calcCustom = (addressType: string) => {
          switch (addressType) {
            case 'p2wpkh':
              return hookout.fee / config.p2wpkhTransactionWeight;
            case 'legacy':
              return hookout.fee / config.p2pkhTransactionWeight;
            case 'p2sh':
              return hookout.fee / config.p2shp2wpkhTransactionWeight;
            case 'p2wsh':
              return hookout.fee / config.p2wshTransactionWeight;
            case 'p2tr':
              return hookout.fee / config.p2trTransactionWeight;
            default:
              throw new Error('unexpected type');
          }
        };

        if (hookout.priority !== 'BATCH') {
          const noChange = hookout.priority === 'FREE';
          const sendTransaction = config.hasCoinsayer
            ? await rpcClient.createSmartTransaction(
                hookout,
                hookout.priority === 'IMMEDIATE' || hookout.priority === 'FREE' ? otherHookouts : [], // we don't really want to
                hookout.priority === 'IMMEDIATE'
                  ? feeSchedule.immediateFeeRate
                  : hookout.priority === 'CUSTOM'
                  ? calcCustom(addressInfo.kind)
                  : 0.25, // 0 = free transaction,
                noChange,
                hookout.rbf
              )
            : await rpcClient.createNormalTransaction(
                hookout,
                hookout.priority === 'IMMEDIATE' || hookout.priority === 'FREE' ? otherHookouts : [],
                hookout.priority === 'IMMEDIATE'
                  ? feeSchedule.immediateFeeRate
                  : hookout.priority === 'CUSTOM'
                  ? calcCustom(addressInfo.kind)
                  : 0.25, // 0 = free transaction,
                noChange,
                hookout.rbf
              );
          if (sendTransaction === 'FREE_TRANSACTION_TOO_EXPENSIVE') {
            return ackClaimable.toPOD();
          }
          if (sendTransaction instanceof Error) {
            console.warn(
              'could not create the transaction, to: ',
              {
                hookout: hookout.toPOD(),
                otherHookouts: otherHookouts.map((h) => h.toPOD),
                feeRate: feeSchedule.immediateFeeRate,
                noChange,
              },
              'got error: ',
              sendTransaction
            );
            const status = new StatusFailed(hookoutHash, sendTransaction.message, hookout.fee + (hookout.amount - 100));
            await dbStatus.insertStatus(status, dbClient);
            return;
          }
          const txid = hi.Buffutils.toHex(sendTransaction.txid);

          await dbClient.query(
            `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
        VALUES($1, $2, $3, 'SENDING')
      `,
            [txid, sendTransaction.hex, Math.round(sendTransaction.fee)]
          );

          // TODO: can be flattened into a single query
          for (const h of sendTransaction.allOutputs) {
            const status = new StatusBitcoinTransactionSent(h.hash(), sendTransaction.txid);
            await dbStatus.insertStatus(status, dbClient);
          }

          // actually send in the background

          // TODO: Additional check against block explorer to see if tx is actually broadcasted.
          (async () => {
            try {
              await rpcClient.sendRawTransaction(sendTransaction.hex);
              await pool.query(`UPDATE bitcoin_transactions SET status = 'SENT' WHERE txid = $1`, [txid]);
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
  }

  return ackClaimable.toPOD();
}
