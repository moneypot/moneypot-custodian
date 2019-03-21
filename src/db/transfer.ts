import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';

// Returns true if was able, returns false if already existts
export async function insertTransfer(client: pg.PoolClient, transfer: hi.AcknowledgedTransfer): Promise<boolean> {
  let res;
  try {
    res = await client.query(
      `INSERT INTO transfers(hash, transfer)
                        VALUES($1, $2)`,
      [transfer.contents.hash().toBech(), transfer.toPOD()]
    );
  } catch (err) {
    if (err.code === '23505') {
      switch (err.constraint) {
        case 'transfers_pkey':
          return false;
      }
      console.error('unknown error trying to insert transfer into db: ', err);
    }
    throw err;
  }

  assert.strictEqual(res.rowCount, 1);
  return true;
}

export async function insertBounty(client: pg.PoolClient, bounty: hi.Bounty) {
  const bountyHash = bounty.hash().toBech();

  let res;
  try {
    res = await client.query(
      `INSERT INTO bounties(hash, bounty)
                 VALUES($1, $2)`,
      [bountyHash, bounty]
    );
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'bounties_pkey') {
      throw 'BOUNTY_ALREADY_EXISTS';
    }
    throw err;
  }

  assert.strictEqual(res.rowCount, 1);
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
