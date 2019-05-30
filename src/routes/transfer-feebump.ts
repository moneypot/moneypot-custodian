import * as assert from 'assert';
import * as hi from 'hookedin-lib';
import { withTransaction } from '../db/util';
import * as dbTransfer from '../db/transfer';
import * as rpcClient from '../util/rpc-client';

// expects a { transfer, feeBump }
export default async function makeTransfer(body: any): Promise<string> {
  if (typeof body !== 'object') {
    throw 'expected object of {transfer,feeBump}';
  }

  const transfer = hi.Transfer.fromPOD(body.transfer);
  if (transfer instanceof Error) {
    throw transfer;
  }

  if (!transfer.isAuthorized()) {
    throw 'transfer was not authorized';
  }

  const feebump = hi.FeeBump.fromPOD(body.feeBump);
  if (feebump instanceof Error) {
    throw feebump;
  }

  if (hi.Buffutils.compare(feebump.hash().buffer, transfer.outputHash.buffer) !== 0) {
    throw 'feebump does not match transfer';
  }

  const tranferFee = transfer.inputAmount() - transfer.change.amount;
  if (tranferFee < 1000) {
    // TODO: a const?
    throw 'must bump at least 1000 sats';
  }

  const txid: string = hi.Buffutils.toHex(feebump.txid);

  const previousFee = await rpcClient.getMemPoolEntryFee(txid);
  if (previousFee === undefined) {
    throw 'TXID_NOT_FOUND';
  }

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, transfer);
    if (insertRes === 'ALREADY_EXISTS') {
      throw insertRes;
    }
    assert.strictEqual(insertRes, 'SUCCESS');

    await dbTransfer.insertFeeBump(dbClient, feebump);
  });

  try {
    await rpcClient.bumpFee(txid, previousFee + tranferFee);
  } catch (err) {
    console.error('user paid for a bump did not get it?!', err, txid);
    throw err;
  }

  const acknowledgement = hi.Signature.compute(transfer.hash().buffer, hi.Params.acknowledgementPrivateKey);

  await dbTransfer.ackTransfer(transfer.hash().toPOD(), acknowledgement.toPOD());
  return acknowledgement.toPOD();}
