import assert from 'assert';
import * as hi from 'moneypot-lib';

import { pool, poolQuery } from './util';
import { PoolClient } from 'pg';
import { ackSecretKey } from '../custodian-info';

export async function insertStatus(status: hi.Status, client?: PoolClient) {
  // const connection = client || pool;

  const ackStatus = hi.Acknowledged.acknowledge(status, ackSecretKey);

  const pod = ackStatus.toPOD();

  // const res = await pool.query(
  //   `INSERT INTO statuses(status) VALUES($1) ON CONFLICT ((status->>'hash')) DO NOTHING`,
  //   [pod]
  // );
  const res = await poolQuery(
    `INSERT INTO statuses(status) VALUES($1) ON CONFLICT ((status->>'hash')) DO NOTHING`,
    [pod], pod, 'status #1: insert into statuses'
  );
  assert.strictEqual(res.rowCount, 1);

  return pod;
}
