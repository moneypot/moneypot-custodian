import assert from "assert";
import * as config from "../config";
import * as hi from "hookedin-lib";
import * as rpcClient from "../util/rpc-client";


import * as dbTransfer from "../db/transfer";
import { withTransaction, pool } from "../db/util";

export default async function(body: any): Promise<hi.Signature> {

    console.log("Got transfer:" , body);

    const transfer = hi.Transfer.fromPOD(body);
    if (transfer instanceof Error) {
        throw transfer;
    }
    
    const source = transfer.source;
    const output = transfer.output;




    const transferHash = transfer.hash().toBech();
    let expectedFee = hi.Params.basicTransferFee;


    // Can optimize a SpentCoinSet case by doing a quick pre-check



    if (source instanceof hi.SpentTransactionHookin) {

        if (!(output instanceof hi.ClaimableCoinSet)) {
            throw "expected a claimablecoinset output";
        }

        const hookin = source.hookin;

        const txOut = await rpcClient.getTxOut(hookin.txid, hookin.vout);

        // TODO: require a certain amount of confs..
        // const { confirmations } = txOut.result;

        const expectedAddress = hi.Params.fundingPublicKey.tweak(hookin.tweak.toPublicKey()).toBitcoinAddress(true);
        if (expectedAddress !== txOut.address) {
            console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
            throw "wrong transaction hookin info";
          }

        expectedFee = hi.Params.transactionConsolidationFee;
    
        if (expectedFee >= txOut.amount) {
            throw "hookin is just dust (would be consumed totally by fees)";
        }
    }

    if (output instanceof hi.TransactionHookout) {
        if (!output.immediate) {
            throw "non-immediate hookouts not yet supported ;(";
        }

        expectedFee = Math.round(0.25 * hi.Params.templateTransactionWeight);
    }

    const sourceSum = source.amount;
    const outputSum = output.amount;
    const actualFee = sourceSum - outputSum;

    if (expectedFee > actualFee) {
        throw "transaction doesn't have enough fees (expected " + expectedFee + " but got " + actualFee + ")";
    }

    let txRes: undefined | { txid: string, hex: string, fee: number };

    if (output instanceof hi.TransactionHookout) {
        // TODO: support queuing...
        const feeRate = actualFee / hi.Params.templateTransactionWeight;
        txRes = await rpcClient.createTransaction(output.bitcoinAddress, output.amount, feeRate);
    }


    const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(transfer, hi.Params.acknowledgementPrivateKey);


    await withTransaction(async (dbClient) => {

        const insertRes = await dbTransfer.insertTransfer(dbClient, transferHash, source.hash(), output.hash(), ackTransfer.acknowledgement);
        if (insertRes === "TRANSFER_ALREADY_EXISTS") {
            return;
        }

        if (source instanceof hi.SpentTransactionHookin) {
            await dbTransfer.insertTransactionHookin(dbClient, transferHash, source);
        } else if (source instanceof hi.SpentCoinSet) {
            await dbTransfer.insertSpentCoins(dbClient, transferHash, source);
        } else {
            throw new Error("unreachable! unexpected source: " + source);
        }

        if (output instanceof hi.ClaimableCoinSet) {
            await dbTransfer.insertClaimableCoins(dbClient, transferHash, output);
        } else if (output instanceof hi.TransactionHookout) {
            await dbTransfer.insertTransactionHookout(dbClient, transferHash, output, txRes!);
        } else {
            throw new Error("unreachable! unexpected output " +  output);
        }
    
    })


    return ackTransfer.acknowledgement;
}