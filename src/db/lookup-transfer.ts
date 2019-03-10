import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

type AckedTransfer = hi.POD.Transfer & hi.POD.Acknowledged;

// export async function byHash(hash: string): Promise<AckedTransfer | undefined> {

//   const res = await pool.query(`
//     SELECT acknowledgement FROM transfers WHERE source_hash = $1
//   `, [sourceHash]);

//   if (res.rows.length === 0) {
//     return undefined;
//   }

//   assert.strictEqual(res.rows.length, 1);

//   const row = res.rows[0];

//   return {
//     acknowledgement: row["acknowledgement"] as string,
//     sourceHash,
//     outputHash: row["output_hash"] as string
//   }

// };

export async function byInput(input: string): Promise<AckedTransfer | undefined> {
  const res = await pool.query(
    `
       SELECT input, output, "authorization", acknowledgement
       FROM transfers WHERE input = $1 
    `,
    [input]
  );

  if (res.rows.length === 0) {
    return undefined;
  }

  assert(res.rows.length === 1);
  const row = res.rows[0];

  return {
    input: row['input'] as string,
    output: row['output'] as string,
    authorization: row['authorization'] as string,
    acknowledgement: row['acknowledgement'] as string,
  };
}
