import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';

export async function insertTransfer(
  client: pg.PoolClient,
  transferHash: string,
  input: hi.Hash,
  output: hi.Hash,
  authorization: hi.Signature,
  acknowledgement: hi.Signature
) {
  let res;
  try {
    res = await client.query(
      `INSERT INTO transfers(hash, input, output, "authorization", acknowledgement)
                        VALUES($1, $2, $3, $4, $5)`,
      [transferHash, input.toBech(), output.toBech(), authorization.toBech(), acknowledgement.toBech()]
    );
  } catch (err) {
    if (err.code === '23505') {
      switch (err.constraint) {
        case 'transfers_pkey':
          return 'TRANSFER_ALREADY_EXISTS';
        case 'transfers_input_key':
          return 'TRANSFER_INPUT_ALREADY_EXISTS';
      }
      console.error('unknown error trying to insert transfer into db: ', err);
    }
    throw err;
  }

  assert.strictEqual(res.rowCount, 1);
}

export async function insertBounty(client: pg.PoolClient, transferHash: string, bounty: hi.Bounty) {
  let res;  
  try {
      res = await client.query(
        `INSERT INTO bounties(hash, transfer_hash, amount, claimant, nonce)
                 VALUES($1, $2, $3, $4, $5)`,
        [bounty.hash().toBech(), transferHash, bounty.amount, bounty.claimant.toBech(), hi.Buffutils.toHex(bounty.nonce)]
      );
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'bounties_pkey') {
        throw 'BOUNTY_ALREADY_EXISTS';
      }
      throw err;
    }

    assert.strictEqual(res.rowCount, 1);
}

export async function insertSpentCoins(client: pg.PoolClient, transferHash: string, coins: hi.ClaimedCoinSet) {
  for (const coin of coins) {
    let res;
    try {
      res = await client.query(
        `INSERT INTO spent_coins(owner, transfer_hash, magnitude, existence_proof)
            VALUES($1, $2, $3, $4)`,
        [coin.owner.toBech(), transferHash, coin.magnitude, coin.existenceProof.toBech()]
      );
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'spent_coins_pkey') {
        console.log('[debug] tried to double spend coin: ', coin);
        return 'COIN_ALREADY_SPENT';
      }
      throw err;
    }

    assert(res.rowCount === 1);
  }
}

export async function insertHookin(client: pg.PoolClient, transferHash: string, hookin: hi.Hookin) {
  const depositAddress = hi.Params.fundingPublicKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(true);

  try {
    await client.query(
      `
                INSERT INTO hookins(hash, transfer_hash, txid, vout, credit_to, derive_index, tweak, deposit_address, amount)
                VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)       
                `,
      [
        hookin.hash().toBech(),
        transferHash,
        hi.Buffutils.toHex(hookin.txid),
        hookin.vout,
        hookin.creditTo.toBech(),
        hookin.deriveIndex,
        hookin.getTweak().toBech(),
        depositAddress,
        hookin.amount,
      ]
    );
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'hookins_pkey') {
      throw 'HOOKIN_ALREADY_EXISTS';
    }

    throw err;
  }
}

type TxInfo = { txid: string; hex: string; fee: number };

export async function insertTransactionHookout(
  client: pg.PoolClient,
  transferHash: string,
  hookout: hi.Hookout,
  tx: TxInfo
) {
  await client.query(
    `
            INSERT INTO bitcoin_transactions(txid, hex, fee, status)
            VALUES($1, $2, $3, $4)
        `,
    [tx.txid, tx.hex, tx.fee, 'SENDING']
  );

  await client.query(
    `
           INSERT INTO hookouts(hash, transfer_hash, amount, bitcoin_address, nonce, immediate, txid)
           VALUES($1, $2, $3, $4, $5, $6, $7)
        `,
    [
      hookout.hash().toBech(),
      transferHash,
      hookout.amount,
      hookout.bitcoinAddress,
      hi.Buffutils.toHex(hookout.nonce),
      hookout.immediate,
      tx.txid,
    ]
  );
}
