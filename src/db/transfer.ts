import assert from 'assert';

import pg from 'pg';

import * as hi from 'hookedin-lib';
import { withTransaction, pool } from './util';
import { fundingSecretKey, ackSecretKey } from '../custodian-info';

// Returns true if was able, returns false if already existts

type InsertRes = hi.Acknowledged.Claimable | 'ALREADY_EXISTS' | 'DOUBLE_SPEND';

export async function insertTransfer(
  transfer: hi.LightningPayment | hi.Hookout | hi.FeeBump
): Promise<InsertRes> {
  const transferHash = transfer.hash();

  const transferHashStr: string = transferHash.toPOD();

  const ackdClaimble = hi.Acknowledged.acknowledge(new hi.Claimable(transfer), ackSecretKey);

  return withTransaction(async client => {
    let res;
    try {
      res = await client.query(`INSERT INTO claimables(claimable) VALUES($1)`, [
        ackdClaimble.toPOD(),
      ]);
    } catch (err) {
      if (err.code === '23505') {
        switch (err.constraint) {
          case 'claimables_pkey': // TODO: ... verify this..
            return 'ALREADY_EXISTS';
        }
        console.error('unknown error trying to insert transfer into db: ', err);
      }
      throw err;
    }

    assert.strictEqual(res.rowCount, 1);

    // TODO: do this in a single query...
    for (const coin of transfer.inputs) {
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

    return ackdClaimble;
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
