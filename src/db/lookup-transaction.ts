import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';


// Given a hookin
export default async function(hookinHash: hi.Hash) {

  const res = await pool.query(`
    SELECT jsonb_build_object(
      'hash', transactions.hash,
      'sourceHash', transactions.source_hash,
          'claimableOutputs', (
            SELECT jsonb_agg(jsonb_build_object(
                  'claimant', claimable_outputs.claimant,
                  'coinMagnitude', claimable_outputs.coin_magnitude
            ))
            FROM claimable_outputs
            WHERE claimable_outputs.transaction_hash = transactions.hash
           ),
          'defundingOutput', (
          SELECT jsonb_build_object('priority', defunding_outputs.priority)
          FROM defunding_outputs
          WHERE defunding_outputs.transaction_hash = transactions.hash
       ),
       'acknowledgement', transactions.acknowledgement
    ) AS v  
  FROM hookins JOIN transactions ON hookins.transaction_hash = transactions.hash
  WHERE
   hookins.hash = $1
  `, [hookinHash.toBech()]);


  if (res.rows.length === 0) {
    return undefined;
  }
  assert(res.rows.length === 1);

  return hi.Transaction.fromPOD(res.rows[0].v);
};
