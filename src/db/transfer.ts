import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';



export async function insertTransfer(client: pg.PoolClient,
    transferHash: string,
    inputHash: hi.Hash,
    outputHash: hi.Hash,
    acknowledgement: hi.Signature) {

        let res;
        try {
            res = await client.query(
                `INSERT INTO transfers(hash, input_hash, output_hash, acknowledgement)
                        VALUES($1, $2, $3, $4)`,
                [transferHash, inputHash.toBech(), outputHash.toBech(), acknowledgement.toBech()]
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
        let res;
        try {
            res = await client.query(
                `INSERT INTO claimable_coins(claimant, magnitude, transfer_hash)
                 VALUES($1, $2, $3)`,
                [coin.claimant.toBech(), coin.magnitude, transferHash]
            );
        } catch (err) {
            if (err.code === "23505" && err.constraint === "claimable_coins_pkey") {
                throw "CLAIMABLE_COIN_ALREADY_EXISTS";
            }
            throw err;
        }

        assert.strictEqual(res.rowCount, 1)
    }
};


export async function insertSpentCoins(client: pg.PoolClient, transferHash: string, coins: hi.SpentCoinSet) {

    for (let i = 0; i < coins.length; i++) {

        const coin = coins.get(i);
        const spendAuthorization = coins.spendAuthorization[i];

        let res;
        try {
    
            res = await client.query(`INSERT INTO spent_coins(owner, transfer_hash, magnitude, existence_proof, spend_authorization)
            VALUES($1, $2, $3, $4, $5)`,
            [
                coin.owner.toBech(),
                transferHash,
                coin.magnitude,
                coin.existenceProof.toBech(),
                spendAuthorization.toBech()
            ]);

        } catch (err) {
            if (err.code === "23505" && err.constraint === "spent_coins_pkey") {
                console.log("[debug] tried to double spend coin: ", coin);
                return "COIN_ALREADY_SPENT";
            }
            throw err;
        }

        assert(res.rowCount === 1);
    }
}

export async function insertTransactionHookin(client: pg.PoolClient, transferHash: string, shookin: hi.SpentHookin) {

    const hookin = shookin.hookin;

    const depositAddress = hi.Params.fundingPublicKey.tweak(hookin.tweak.toPublicKey()).toBitcoinAddress(true);

    try {
        await client.query(
            `
                INSERT INTO hookins(hash, transfer_hash, spend_authorization, txid, vout, credit_to, derive_index, tweak, deposit_address, amount)
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
        if (err.code === "23505" && err.constraint === "hookins_pkey") {
            throw "HOOKIN_ALREADY_EXISTS";
        }


        throw err
    }

}

type TxInfo = { txid: string, hex: string, fee: number }

export async function insertTransactionHookout(client: pg.PoolClient, transferHash: string, hookout: hi.Hookout, 
    tx: TxInfo) {

        await client.query(`
            INSERT INTO bitcoin_transactions(txid, hex, fee, status)
            VALUES($1, $2, $3, $4)
        `, [tx.txid, tx.hex, tx.fee, 'SENDING']);


        await client.query(`
           INSERT INTO hookouts(hash, transfer_hash, amount, bitcoin_address, nonce, immediate, txid)
           VALUES($1, $2, $3, $4, $5, $6, $7)
        `, [
            hookout.hash().toBech(),
            transferHash,
            hookout.amount,
            hookout.bitcoinAddress,
            hi.Buffutils.toHex(hookout.nonce),
            hookout.immediate,
            tx.txid
        ]);

}