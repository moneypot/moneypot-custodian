import * as hi from "hookedin-lib";

import dbInsertTransaction from "../db/insert-coinset-transfer";

export default async function(body: any) {

    const transfer = hi.Transfer.fromPOD(body);
    if (transfer instanceof Error) {
        throw transfer;
    }

    const source = transfer.source;
    if (!(source instanceof hi.SpentCoinSet)) {
        throw new Error("only supports spentcoinset for this end point atm");
    }

    const output = transfer.output;
    if (output instanceof hi.Hash) {
        throw new Error("can not used pruned output");
    }

    if (output.hookout !== undefined) {
        throw new Error("hookouts not currently supported");
    }

    // TODO: validate  amounts and inputs...


    const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(transfer, hi.Params.acknowledgementPrivateKey);

    await dbInsertTransaction(ackTransfer);

    return ackTransfer.toPOD();
}