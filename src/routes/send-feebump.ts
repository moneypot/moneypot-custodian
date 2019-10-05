import * as hi from 'hookedin-lib';
import StatusBitcoinTransactionSent from 'hookedin-lib/dist/status/bitcoin-transaction-sent';
import StatusFailed from 'hookedin-lib/dist/status/failed';

import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import * as rpcClient from '../util/rpc-client';

export default async function sendFeeBump(feebump: hi.FeeBump) {
  const feeBumpHash = feebump.hash();

  const insertRes = await dbTransfer.insertTransfer(feebump);
  if (!(insertRes instanceof hi.Acknowledged.default)) {
    throw insertRes;
  }

  (async function() {
    // send in the background

    const oldTxid: string = hi.Buffutils.toHex(feebump.txid);

    const previousFee = await rpcClient.getMemPoolEntryFee(oldTxid);

    if (previousFee === undefined) {
      await dbStatus.insertStatus(new StatusFailed(feeBumpHash, 'transaction was not in mempool', feebump.fee));
      return;
    }

    const newTxid = await rpcClient.bumpFee(oldTxid, previousFee + feebump.amount);

    if (newTxid instanceof Error) {
      const status = new StatusFailed(feeBumpHash, newTxid.message, feebump.fee);

      await dbStatus.insertStatus(status);
      return;
    }

    const status = new StatusBitcoinTransactionSent(feeBumpHash, newTxid);
    await dbStatus.insertStatus(status);
  })();

  return insertRes.toPOD();
}
