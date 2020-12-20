// import * as hi from 'moneypot-lib';
// import { pool } from '../db/util';

// export default async function getClaimable(url: string) {
//   const hash = url.substring('/claimables/'.length);

//   const h = hi.Hash.fromPOD(hash);
//   if (h instanceof Error) {
//     throw 'INVALID_HASH';
//   }

//   const { rows } = await pool.query(`SELECT claimable, created FROM claimables WHERE claimable->>'hash' = $1`, [hash]);
//   if (rows.length === 0) {
//     return null;
//   }

//   let c = rows[0].transfer;
//   c.initCreated = Math.round(rows[0].created / 60000) * 60000;

//   return c as hi.POD.Claimable & hi.POD.Acknowledged;
// }
