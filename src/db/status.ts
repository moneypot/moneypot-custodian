import assert from 'assert';
import { Status } from '../status';
import { pool } from './util';
import { PoolClient } from 'pg';

export async function insertStatus(claimableHash: string, status: Status, client?: PoolClient): Promise<void> {
  const connection = client || pool;
  const res = await connection.query(`INSERT INTO statuses(claimable_hash, status) VALUES($1, $2)`, [
    claimableHash,
    status,
  ]);
  assert.strictEqual(res.rowCount, 1);
}
