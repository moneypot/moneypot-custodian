import assert from 'assert';
import * as hi from 'hookedin-lib';
import pg from 'pg';
import { withTransaction, pool } from './util';

// Returns true if was able, returns false if already existts

type InsertRes = 'SUCCESS' | 'ALREADY_EXISTS';

export async function insertTransfer(client: pg.PoolClient, transfer: hi.Transfer): Promise<InsertRes> {
  const transferHash: string = transfer.hash().toPOD();

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
  for (const coin of transfer.inputs) {
    const owner: string = coin.owner.toPOD();
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

export async function removeTransfer(client: pg.PoolClient, transferHash: string) {
  await client.query(`DELETE FROM transfer_inputs WHERE transfer_hash = $1`, [transferHash]);
  await client.query(`DELETE FROM transfers WHERE hash = $1`, [transferHash]);
}

export async function ackTransfer(transferHash: string, acknowledgement: string) {
  await pool.query(`UPDATE transfers SET acknowledgement = $1 WHERE hash = $2 AND acknowledgement IS NULL`, [
    acknowledgement,
    transferHash,
  ]);
}

export async function insertHookout(client: pg.PoolClient, hookout: hi.Hookout) {
  await client.query(
    `INSERT INTO hookouts(hash, hookout)
           VALUES($1, $2)`,
    [hookout.hash().toPOD(), hookout.toPOD()]
  );
}

export async function removeHookout(client: pg.PoolClient, hookoutHash: string) {
  await client.query(`DELETE FROM hookouts WHERE hash = $1`, [hookoutHash]);
}

export async function insertLightningPayment(client: pg.PoolClient, payment: hi.LightningPayment) {
  await client.query(
    `INSERT INTO lightning_payments(hash, lightning_payment)
           VALUES($1, $2)`,
    [payment.hash().toPOD(), payment.toPOD()]
  );
}

export async function removeLightningPayment(client: pg.PoolClient, paymentHash: string) {
  await client.query(`DELETE FROM lightning_payments WHERE hash = $1`, [paymentHash]);
}

type TxInfo = { txid: string; hex: string; fee: number };
export async function insertBitcoinTransaction(client: pg.PoolClient, tx: TxInfo) {
  await client.query(
    `INSERT INTO bitcoin_transactions(txid, hex, fee, status)
        VALUES($1, $2, $3, $4)`,
    [tx.txid, tx.hex, tx.fee, 'SENDING']
  );
}

export async function insertFeeBump(client: pg.PoolClient, feeBump: hi.FeeBump) {
  await client.query(`INSERT INTO fee_bumps(hash, fee_bump) VALUES ($1, $2)`, [
    feeBump.hash().toPOD(),
    feeBump.toPOD(),
  ]);
}
