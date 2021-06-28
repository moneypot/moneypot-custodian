import * as hi from 'moneypot-lib';
import StatusBitcoinTransactionSent from 'moneypot-lib/dist/status/bitcoin-transaction-sent';
import StatusFailed from 'moneypot-lib/dist/status/failed';

import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import * as rpcClient from '../util/rpc-client';
import { pool } from '../db/util';
import BitcoinTransactionSent from 'moneypot-lib/dist/status/bitcoin-transaction-sent';

import { assert } from 'console';

export default async function sendFeeBump(feebump: hi.FeeBump) {
  const feeBumpHash = feebump.hash();

  const oldTxid = hi.Buffutils.toHex(feebump.txid);

  const isMoneypot = await rpcClient.getTransaction(oldTxid);

  if (isMoneypot === undefined) {
    throw `cannot determine transaction ${oldTxid}`;
  }

  const hasSize = await rpcClient.decodeRawTransaction(isMoneypot.hex);
  const MempoolFee = await rpcClient.getMemPoolEntry(oldTxid);

  if (MempoolFee === undefined) {
    throw `no mempool fee found for ${oldTxid}`;
  }

  let previousFee = MempoolFee.fees.base;
  assert(Number.isFinite(previousFee));
  previousFee = previousFee * 1e8;

  // HUGE TODO: See if comparing feerates like this is realistic in real environments, if not, make fee less dynamic clientside and add rebate to BitcoinTransactionSent?!
  const newFee = await rpcClient.getDynamicFeeRate(feebump.confTarget);
  if (newFee instanceof Error || newFee === 'BITCOIN_CORE_NOT_RESPONDING') {
    throw newFee instanceof Error ? newFee : 'BITCOIN_CORE_NOT_RESPONDING';
  }
  const expectedfee = Math.round(newFee * hasSize.weight) - previousFee;
  // default increase is 5 sat/b if newFee is equal (or < 5 away from target) to oldFee(?)
  const minValue = Math.round((hasSize.weight / 4) * 5);
  if (expectedfee > minValue) {
    if (expectedfee > feebump.amount) {
      throw `EXPECTED ${expectedfee} sat, but received ${feebump.amount} sat. Increase your feebump by ${
        expectedfee - feebump.amount
      } sat`;
    }
  } else if (minValue >= expectedfee) {
    if (minValue > feebump.amount) {
      throw `EXPECTED ${minValue} sat, but received ${feebump.amount} sat. Increase your feebump by ${
        minValue - feebump.amount
      } sat`;
    }
  }

  const insertRes = await dbTransfer.insertTransfer(feebump);
  if (insertRes === 'NOT_AUTHORIZED_PROPERLY' || insertRes === 'DOUBLE_SPEND' || insertRes === 'CHEATING_ATTEMPT') {
    throw insertRes;
  }
  const [ackClaimable, isNew] = insertRes;

  if (isNew) {
    // send in the background

    (async function () {
      const oldTxid: string = hi.Buffutils.toHex(feebump.txid);

      const previousTx = await rpcClient.getMemPoolEntry(oldTxid);

      if (!previousTx) {
        await dbStatus.insertStatus(
          new StatusFailed(feeBumpHash, 'transaction was not in mempool, unlucky!', feebump.amount)
        );
        return;
      }

      const res = await rpcClient.bumpFee(oldTxid, feebump.confTarget);
      if (res instanceof Error) {
        const status = new StatusFailed(feeBumpHash, res.message, feebump.amount);

        await dbStatus.insertStatus(status);
        return;
      }
      const newTxid = hi.Buffutils.fromHex(res.txid, 32);

      if (newTxid instanceof Error) {
        throw new Error(newTxid.message); // impossible really.
      }
      const status = new StatusBitcoinTransactionSent(feeBumpHash, newTxid);

      // maybe: Feebump ontop of feebump?
      const getStatuses = await pool.query(
        `SELECT status FROM statuses WHERE status->>'kind' = 'BitcoinTransactionSent'
       AND status->>'txid' = $1
       `,
        [oldTxid]
      );
      for (const { status } of getStatuses.rows) {
        const getClaimables = await pool.query(
          `SELECT claimable FROM claimables WHERE claimable->>'hash' = $1
         AND (claimable->>'kind' = 'Hookout' OR claimable->>'kind' = 'FeeBump')
         `,
          [status.claimableHash]
        );
        for (const { claimable } of getClaimables.rows) {
          const actualClaimable = hi.claimableFromPOD(claimable);
          if (actualClaimable instanceof Error) {
            throw actualClaimable; // impossible
          }
          const claimableHash = actualClaimable.hash();
          await dbStatus.insertStatus(new BitcoinTransactionSent(claimableHash, newTxid));
        }
      }
      await dbStatus.insertStatus(status);
    })();
  }

  return ackClaimable.toPOD();
}
