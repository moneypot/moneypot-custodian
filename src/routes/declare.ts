import assert from "assert";
import * as hi from "hookedin-lib";
import http from "http";
import readJson from "../util/read-json";
import dbLookupTransaction from "../db/lookup-transaction";
import dbInsertHookinTransaction from "../db/insert-hookin-transaction";
import * as rpcClient from "../rpc-client";
import * as config from "../config";

export default async function(json: any): Promise<hi.Transaction> {

    const hookin = hi.Hookin.fromPOD(json);

    const foundTransaction = await dbLookupTransaction(hookin.hash());
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
    const outputs = hi.ClaimableOutputSet.fromPayTo(hookin.creditTo, out.amount - fee);
  
    const transaction = new hi.Transaction(hookin, outputs);
    transaction.acknowledge(hi.Params.acknowledgementPrivateKey);
  
    await dbInsertHookinTransaction(transaction, out.address, out.amount, fee);
  
    return transaction;
}