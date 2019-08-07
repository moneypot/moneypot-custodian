import assert from 'assert';
import * as hi from 'hookedin-lib';

import { pool } from './util';
import { PoolClient } from 'pg';

export async function insertStatus(claimableHash: string, status: hi.Status.All, client?: PoolClient): Promise<void> {
  const connection = client || pool;
  const res = await connection.query(`INSERT INTO statuses(claimable_hash, status) VALUES($1, $2)`, [
    claimableHash,
    status,
  ]);
  assert.strictEqual(res.rowCount, 1);
}
