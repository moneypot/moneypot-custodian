import assert from 'assert';
import * as config from '../../config';
import * as hi from 'hookedin-lib';
import * as rpcClient from '../../util/rpc-client';

import * as dbTransfer from '../../db/transfer';
import { withTransaction, pool } from '../../db/util';

// hookin2coin :: returns an acknowledgement
export default async function(body: any): Promise<string> {
  const transfer = hi.TransferHookinToCoin.fromPOD(body);
  if (transfer instanceof Error) {
    throw transfer;
  }

  const txOut = await rpcClient.getTxOut(transfer.input.txid, transfer.input.vout);

  // TODO: require a certain amount of confs..
  // const { confirmations } = txOut.result;

  const expectedAddress = hi.Params.fundingPublicKey.tweak(transfer.input.getTweak().toPublicKey()).toBitcoinAddress(true);
  if (expectedAddress !== txOut.address) {
      console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
      throw "wrong transaction hookin info";
  }
  
  const transferHash = transfer.hash().toBech();

  const ackTransfer: hi.AcknowledgedTransferHookinToCoin = hi.Acknowledged.acknowledge(
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
    }

    await dbTransfer.insertTransactionHookin(dbClient, transferHash, transfer.input);
    await dbTransfer.insertClaimableCoins(dbClient, transferHash, transfer.output);
  });

  return ackTransfer.acknowledgement.toBech();
}
