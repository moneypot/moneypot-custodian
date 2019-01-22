import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';



export async function insertTransfer(client: pg.PoolClient,
    transferHash: string,
    sourceHash: hi.Hash,
    outputHash: hi.Hash,
    acknowledgement: hi.Signature) {

        let res;
        try {
            res = await client.query(
                `INSERT INTO transfers(hash, source_hash, output_hash, acknowledgement)
                        VALUES($1, $2, $3, $4)`,
                [transferHash, sourceHash.toBech(), outputHash.toBech(), acknowledgement.toBech()]
                );
        } catch (err) {
            if (err.code === "23505" && err.constraint === "transfers_pkey") {
                return "TRANSFER_ALREADY_EXISTS";
            }
            throw err;
        }

        assert.strictEqual(res.rowCount, 1);

}

export async function insertClaimableCoins(client: pg.PoolClient, transferHash: string, coins: hi.ClaimableCoinSet) {

    // TODO: optimize this into a single query ... lol
    for (const coin of coins) {
        console.log("Inserting claimable coin: ",  [coin.claimant.toBech(), coin.magnitude, transferHash]);

        const { rowCount } = await client.query(
            `INSERT INTO claimable_coins(claimant, magnitude, transfer_hash)
             VALUES($1, $2, $3)`,
            [coin.claimant.toBech(), coin.magnitude, transferHash]
        );
        console.log("Finished. inserting claimable coin: ", coin.claimant.toBech());


        assert.strictEqual(rowCount, 1);
    }
};


export async function insertSpentCoins(client: pg.PoolClient, transferHash: string, coins: hi.SpentCoinSet) {

    for (let i = 0; i < coins.length; i++) {
        const coin = coins.get(i);
        const spendAuthorization = coins.spendAuthorization[i];

        const res = await client.query(`INSERT INTO spent_coins(owner, transfer_hash, magnitude, existence_proof, spend_authorization)
        VALUES($1, $2, $3, $4, $5)`,
        [
            coin.owner.toBech(),
            transferHash,
            coin.magnitude,
            coin.existenceProof.toBech(),
            spendAuthorization.toBech()
        ]);

        assert(res.rowCount === 1);
    }
}

export async function insertTransactionHookin(client: pg.PoolClient, transferHash: string, shookin: hi.SpentTransactionHookin) {

    const hookin = shookin.hookin;

    const depositAddress = hi.Params.fundingPublicKey.tweak(hookin.tweak.toPublicKey()).toBitcoinAddress(true);

    try {
        await client.query(
            `
                INSERT INTO transaction_hookins(hash, transfer_hash, spend_authorization, txid, vout, credit_to, derive_index, tweak, deposit_address, amount)
                VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)       
                `,
            [
              hookin.hash().toBech(),
              transferHash,
              shookin.spendAuthorization.toBech(),
              hi.Buffutils.toHex(hookin.txid),
              hookin.vout,
              hookin.creditTo.toBech(),
              hookin.deriveIndex,
              hookin.tweak.toBech(),
              depositAddress,
              hookin.amount
            ]
          );
    } catch (err) {
        if (err.code === "23505" && err.constraint === "transaction_hookins_pkey") {
            throw "HOOKIN_ALREADY_EXISTS";
        }


        throw err
    }

}

type TxInfo = { txid: string, hex: string, fee: number }

export async function insertTransactionHookout(client: pg.PoolClient, transferHash: string, hookout: hi.TransactionHookout, 
    tx: TxInfo) {

        await client.query(`
            INSERT INTO bitcoin_transactions(txid, hex, fee, status)
            VALUES($1, $2, $3, $4)
        `, [tx.txid, tx.hex, tx.fee, 'SENDING']);


        await client.query(`
           INSERT INTO transaction_hookouts(hash, transfer_hash, amount, bitcoin_address, nonce, immediate, txid)
           VALUES($1, $2, $3, $4, $5, $6, $7)
        `, [
            hookout.hash().toBech,
            transferHash,
            hookout.amount,
            hookout.bitcoinAddress,
            hi.Buffutils.toHex(hookout.nonce),
            hookout.immediate,
            tx.txid
        ]);

}