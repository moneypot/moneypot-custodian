import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

// returns a pruned transfer
export async function bySourceHash(sourceHash: hi.Hash): Promise<(hi.POD.Acknowledged & hi.POD.Transfer) | undefined> {
  const res = await pool.query(`
    SELECT output_hash FROM transfers WHERE source_hash = $1
  `, [sourceHash.toBech()]);

  if (res.rows.length === 0) {
    return undefined;
  }
  assert.strictEqual(res.rows.length, 1);

  const outputHash = hi.Hash.fromBech(res.rows[0]['output_hash']);
  if (outputHash instanceof Error) {
    throw outputHash;
  }

  const transfer = new hi.Transfer(sourceHash, outputHash);

  const ackd: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(transfer, hi.Params.acknowledgementPrivateKey);

  

};
