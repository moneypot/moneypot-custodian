import * as hi from 'hookedin-lib';
import * as dbTransfer from '../db/transfer';
import * as dbStatus from '../db/status';

import { ackSecretKey } from '../custodian-info';

import * as rpcClient from '../util/rpc-client';

export default async function sendFeeBump(body: any): Promise<hi.POD.FeeBump & hi.POD.Acknowledged> {
  const feebump = hi.FeeBump.fromPOD(body);
  if (feebump instanceof Error) {
    throw 'send lightning expected a valid lightning payment';
  }

  if (!feebump.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const feebumpHashStr = feebump.hash().toPOD();

  const ackdFeebump: hi.Acknowledged.FeeBump = hi.Acknowledged.acknowledge(feebump, ackSecretKey);

  const insertRes = await dbTransfer.insertTransfer(ackdFeebump);
  if (insertRes !== 'SUCCESS') {
    throw insertRes;
  }

  (async function() {
    // send in the background

    const oldTxid: string = hi.Buffutils.toHex(feebump.txid);

    const previousFee = await rpcClient.getMemPoolEntryFee(oldTxid);
    if (previousFee === undefined) {
      await dbStatus.insertStatus(
        feebumpHashStr,
        hi.Acknowledged.acknowledge(
          new hi.Status({
            kind: 'HookoutFailed',
            error: 'transaction was not in mempool',
          }),
          ackSecretKey
        )
      );

      return;
    }

    const newTxid = await rpcClient.bumpFee(oldTxid, previousFee + feebump.amount);

    if (newTxid instanceof Error) {
      await dbStatus.insertStatus(
        feebumpHashStr,
        hi.Acknowledged.acknowledge(
          new hi.Status({
            kind: 'FeebumpFailed',
            error: newTxid.message,
          }),
          ackSecretKey
        )
      );
      return;
    }

    await dbStatus.insertStatus(
      feebumpHashStr,

      hi.Acknowledged.acknowledge(
        new hi.Status({
          kind: 'FeebumpSucceeded',
          newTxid,
        }),
        ackSecretKey
      )
    );
  })();

  return ackdFeebump.toPOD();
}
