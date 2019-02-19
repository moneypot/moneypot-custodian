import assert from 'assert';

import * as hi from 'hookedin-lib';
import { pool } from './util';

type CoinInfo = hi.POD.ClaimedCoin & hi.POD.TransferHash & { spendAuthorization: string };

export default async function(owner: string): Promise<CoinInfo | undefined> {
  const res = await pool.query(
    `
       SELECT owner, transfer_hash, magnitude, existence_proof, spend_authorization
       FROM spent_coins WHERE id = $1 
    `,
    [owner]
  );

  if (res.rows.length === 0) {
    return undefined;
  }

  assert(res.rows.length === 1);
  const row = res.rows[0];

  return {
    existenceProof: row['existence_proof'] as string,
    magnitude: row['magnitude'] as hi.POD.Magnitude,
    owner: row['owner'] as string,
    spendAuthorization: row['spend_authorization'] as string,
    transferHash: row['transfer_hash'] as string,
  };
}
