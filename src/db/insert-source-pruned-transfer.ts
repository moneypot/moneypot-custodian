import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';


export default async function(client: pg.PoolClient, ackTransfer: hi.AcknowledgedTransfer) {
    

    const transfer = ackTransfer.contents;


    const transferOutput = transfer.output;
    if (transferOutput instanceof hi.Hash) {
        throw new Error("assertion: function only works with materialized outputs");
    }

    if (transferOutput.hookout !== undefined) {
        throw new Error("TODO: hook outs arent yet supported");
    }

    const transferHash = transfer.hash().toBech();

    const { rowCount } = await client.query(
    `INSERT INTO transfers(hash, source_hash, output_hash, acknowledgement)
            VALUES($1, $2, $3, $4)`,
    [transferHash, transfer.sourceHash().toBech(), transfer.outputHash().toBech(),
        ackTransfer.acknowledgement.toBech()]
    );

    assert.strictEqual(rowCount, 1);

    // TODO: optimize this into a single query ... lol
    for (const coin of transferOutput.coins) {
        const { rowCount } = await client.query(
            `INSERT INTO claimable_coins(transfer_hash, claimant, magnitude)
             VALUES($1, $2, $3)`,
            [transferHash, coin.claimant, coin.magnitude]
        );

        assert.strictEqual(rowCount, 1);
    }


};
