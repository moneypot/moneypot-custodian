import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';
import { withTransaction, pool } from './util';
import { fundingSecretKey } from '../custodian-info';

// Returns true if was able, returns false if already existts

type InsertRes = 'SUCCESS' | 'ALREADY_EXISTS' | 'DOUBLE_SPEND';

export async function insertTransfer(
  transfer: hi.Acknowledged.LightningPayment | hi.Acknowledged.Hookout | hi.Acknowledged.FeeBump
): Promise<InsertRes> {
  const transferHash = transfer.hash();

  const transferHashStr: string = transferHash.toPOD();

  return withTransaction(async client => {
    let res;
    try {
      res = await client.query(`INSERT INTO claimables(hash, claimable) VALUES($1, $2)`, [
        transferHashStr,
        hi.claimableToPod(transfer),
      ]);
    } catch (err) {
      if (err.code === '23505') {
        switch (err.constraint) {
          case 'claimables_pkey':
            return 'ALREADY_EXISTS';
        }
        console.error('unknown error trying to insert transfer into db: ', err);
      }
      throw err;
    }

    assert.strictEqual(res.rowCount, 1);

    // TODO: do this in a single query...
    for (const coin of transfer.contents.inputs) {
      const owner: string = coin.owner.toPOD();
      try {
        res = await client.query(`INSERT INTO transfer_inputs(owner, transfer_hash) VALUES ($1, $2)`, [
          owner,
          transferHash,
        ]);
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'transfer_inputs_pkey') {
          return 'DOUBLE_SPEND';
        }
        throw err;
      }
    }

    return 'SUCCESS';
  });
}

type TxInfo = { txid: string; hex: string; fee: number };
export async function insertBitcoinTransaction(client: pg.PoolClient, tx: TxInfo) {
  await client.query(
    `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
        VALUES($1, $2, $3, $4)`,
    [tx.txid, tx.hex, tx.fee, 'SENDING']
  );
}
