import assert from 'assert';
import * as hi from 'hookedin-lib';

import { pool } from './util';
import { PoolClient } from 'pg';
import { ackSecretKey } from '../custodian-info';


export async function insertStatus(
  status: hi.Status,
  client?: PoolClient
) {
  const connection = client || pool;

  const hashStr = status.hash;

  const ackStatus = hi.Acknowledged.acknowledge(status, ackSecretKey);


  const res = await connection.query(`INSERT INTO statuses(status) VALUES($1)`, [
    hashStr,
    ackStatus.toPOD(),
  ]);
  assert.strictEqual(res.rowCount, 1);

  return ackStatus;
}
