// import assert from 'assert';

// import * as hi from 'hookedin-lib';
// import { pool } from './util';

// type PrunedTransfer = { sourceHash: string, outputHash: string } & hi.POD.Acknowledged

// export async function byHash(hash: string): Promise<PrunedTransfer | undefined> {

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
