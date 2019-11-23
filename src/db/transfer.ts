import assert from 'assert';

import pg from 'pg';

import * as hi from 'moneypot-lib';
import { withTransaction, pool } from './util';
import { fundingSecretKey, ackSecretKey } from '../custodian-info';

// Returns 'DOUBLE_SPEND' on error. On success returns the claimable and if it's new or not
type InsertRes = [hi.Acknowledged.Claimable, boolean] | 'DOUBLE_SPEND';

export async function insertTransfer(transfer: hi.LightningPayment | hi.Hookout | hi.FeeBump): Promise<InsertRes> {
  const transferHash = transfer.hash();

  // TODO: use hi.Acknowledged.Transfer type
  const ackdClaimble: hi.Acknowledged.Claimable = hi.Acknowledged.acknowledge(transfer, ackSecretKey);

  return withTransaction(async client => {
    let res = await client.query(`INSERT INTO claimables(claimable) VALUES($1) ON CONFLICT DO NOTHING`, [
      ackdClaimble.toPOD(),
    ]);
    if (res.rowCount === 0) {
      return [ackdClaimble, false];
    }
    assert.strictEqual(res.rowCount, 1);

    // TODO: do this in a single query...
    for (const coin of transfer.inputs) {
      const owner: string = coin.owner.toPOD();
      try {
        res = await client.query(`INSERT INTO transfer_inputs(owner, transfer_hash) VALUES ($1, $2)`, [
          owner,
          transferHash.toPOD(),
        ]);
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'transfer_inputs_pkey') {
          return 'DOUBLE_SPEND';
        }
        throw err;
      }
    }

    return [ackdClaimble, true];
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
