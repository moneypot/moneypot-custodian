import assert from "assert";
import * as hi from "hookedin-lib";
import * as lookupTransaction from "../db/lookup-transfer";
import dbInsertHookinTransaction from "../db/insert-transaction-hookin-transfer";
import * as rpcClient from "../rpc-client";
import * as config from "../config";

export default async function(json: any): Promise<hi.POD.Transfer & hi.POD.Acknowledged> {

    const hookin = hi.TransactionHookin.fromPOD(json);

    const foundTransaction = await lookupTransaction.bySourceHash(hookin.hash());
    if (foundTransaction) {
      return foundTransaction;
    }
  
    const out = await rpcClient.getTxOut(hookin.txid, hookin.vout);
  
  
    // TODO: require a certain amount of confs..
    // const { confirmations } = out.result;
  
    const expectedAddress = hi.Params.fundingPublicKey.tweak(hookin.tweak.toPublicKey()).toBitcoinAddress(true);
  
    assert(expectedAddress.length > 5); // make sure we have an actual address..
  
    if (expectedAddress !== out.address) {
      console.warn('Expected address: ', expectedAddress, ' got address: ', out.address);
      throw "WRONG_HOOKIN_INFO";
    }
  
    // Now let's calculate the consolidation fee:
  
    const feeRate = await rpcClient.getConsolidationFeeRate();
    const fee = Math.ceil(feeRate * config.inputWeight);
  
    if (fee >= out.amount) {
        throw "CONSOLIDATION_FEE_HIGHER_THAN_AMOUNT";
    }
  
    // Ok, everything looks good.

    const output = hi.TransferOutput.fromPayTo(hookin.creditTo, out.amount - fee);
  
    const transfer = new hi.Transfer(hookin, output);

    const ackedTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(transfer, hi.Params.acknowledgementPrivateKey);
  
    await dbInsertHookinTransaction(ackedTransfer, out.address, out.amount, fee);
  
    return ackedTransfer.toPOD();
}