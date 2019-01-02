import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';


export default async function(client: pg.PoolClient, transaction: hi.Transaction) {
    assert.strictEqual(transaction.defundingOutput, undefined);

    const transactionSource = transaction.source;
    if (transactionSource instanceof hi.Hash) {
        throw new Error("assertion: function only works with unpruned transactions");
    }

    const transactionAck = transaction.acknowledgement;
    if(!(transactionAck instanceof hi.Signature)) {
        throw new Error("assertion: function only works with ack'd transactions");
    }


    const transactionHash = transaction.hash().toBech();

    const { rowCount } = await client.query(
    `INSERT INTO transactions(hash, source_hash, acknowledgement)
            VALUES($1, $2, $3)`,
    [transactionHash, transaction.sourceHash().toBech(), transactionAck.toBech()]
    );

    assert.strictEqual(rowCount, 1);

    // TODO: optimize this into a single query ... lol
    for (const output of transaction.claimableOutputs) {
        const { rowCount } = await client.query(
            `
                INSERT INTO claimable_outputs(claimant, coin_magnitude, transaction_hash)
                VALUES($1, $2, $3)
                `,
            [output.claimant.toBech(), output.coinMagnitude, transactionHash]
        );

        assert.strictEqual(rowCount, 1);
    }


};
