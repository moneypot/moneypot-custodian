import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';

// Returns true if was able, returns false if already existts

type InsertRes = 'SUCCESS' | 'ALREADY_EXISTS';

export async function insertTransfer(client: pg.PoolClient, transfer: hi.AcknowledgedTransfer): Promise<InsertRes> {
  const transferHash: string = transfer.contents.hash().toBech();

  let res;
  try {
    res = await client.query(`INSERT INTO transfers(hash, transfer) VALUES($1, $2)`, [transferHash, transfer.toPOD()]);
  } catch (err) {
    if (err.code === '23505') {
      switch (err.constraint) {
        case 'transfers_pkey':
          return 'ALREADY_EXISTS';
      }
      console.error('unknown error trying to insert transfer into db: ', err);
    }
    throw err;
  }

  assert.strictEqual(res.rowCount, 1);

  // TODO: do this in a single query...
  for (const coin of transfer.contents.inputs) {
    const owner: string = coin.owner.toBech();
    try {
      res = await client.query(`INSERT INTO transfer_inputs(owner, transfer_hash) VALUES ($1, $2)`, [
        owner,
        transferHash,
      ]);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'transfer_inputs_pkey') {
        throw 'INPUT_SPENT';
      }
      throw err;
    }
  }

  return 'SUCCESS';
}

export async function insertBounty(client: pg.PoolClient, bounty: hi.Bounty) {
  const bountyHash = bounty.hash().toBech();

  let res;
  try {
    res = await client.query(
      `INSERT INTO bounties(hash, bounty)
                 VALUES($1, $2)`,
      [bountyHash, bounty.toPOD()]
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

export async function insertTransactionHookout(client: pg.PoolClient, hookout: hi.Hookout, tx: TxInfo) {
  await client.query(
    `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
        VALUES($1, $2, $3, $4)`,
    [tx.txid, tx.hex, tx.fee, 'SENDING']
  );

  await client.query(
    `INSERT INTO hookouts(hash, hookout, txid)
           VALUES($1, $2, $3)`,
    [hookout.hash().toBech(), hookout.toPOD(), tx.txid]
  );
}
