import assert from "assert";
import * as config from "../../config";
import * as hi from "hookedin-lib"
import * as rpcClient from "../../util/rpc-client";


import * as dbTransfer from "../../db/transfer";
import { withTransaction, pool } from "../../db/util";

export default async function(body: any): Promise<string> {

    // TODO: should validate inputs/outputs
    const transfer = hi.TransferCoinToCoin.fromPOD(body);
    if (transfer instanceof Error) {
        throw transfer;
    }

    const transferHash = transfer.hash().toBech();


    const ackTransfer: hi.AcknowledgedTransferCoinToCoin = hi.Acknowledged.acknowledge(transfer, hi.Params.acknowledgementPrivateKey);


    await withTransaction(async (dbClient) => {

        const insertRes = await dbTransfer.insertTransfer(dbClient, transferHash, transfer.input.hash(), transfer.output.hash(), ackTransfer.acknowledgement);
        if (insertRes === "TRANSFER_ALREADY_EXISTS") {
            return;
        }

        const spir = await dbTransfer.insertSpentCoins(dbClient, transferHash, transfer.input);
        if (spir === "COIN_ALREADY_SPENT") {
            throw spir;
        } else {
            const _: undefined = spir;
        }

        await dbTransfer.insertClaimableCoins(dbClient, transferHash, transfer.output);
    });

    return ackTransfer.acknowledgement.toBech();
}