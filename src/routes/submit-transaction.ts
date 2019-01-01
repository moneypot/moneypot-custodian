import * as hi from "hookedin-lib";

import dbInsertTransaction from "../db/insert-transaction";

export default async function(body: any) {

    const transaction = hi.Transaction.fromPOD(body);

    const transInput = transaction.source;
    if (!(transInput instanceof hi.TransactionInputSet)) {
        throw new Error("ONLY_WORKS_WITH_SOURCED_TRANSACTIONS");
    }

    if (transaction.defundingOutput !== undefined) {
        throw new Error("Defunding outputs not currently supported");
    }

    if (transInput.inputSum() < transaction.claimableOutputs.outputSum()) {
        throw new Error("inputs sum less than output sum");
    }

    const transHash = transaction.hash();
    for (const { spendProof, owner } of transInput) {
        if (spendProof === undefined) {
            throw new Error("an input is unsigned");
        }

        if (!spendProof.verify(transHash.buffer, owner)) {
            throw new Error("input was not signed correctly");
        }
    }

    await dbInsertTransaction(transaction);

    

    

}