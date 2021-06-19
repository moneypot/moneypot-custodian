import * as hi from 'moneypot-lib';
import { pool, poolQuery } from '../db/util';
import processHookin from '../util/process-hookin';

export default async function run() {
  console.log('running query');
  // const { rows } = await pool.query(`
  //       SELECT * FROM claimables WHERE claimable->>'kind'='Hookin'
  //       AND NOT EXISTS (
  //           SELECT * FROM statuses WHERE status->>'claimableHash'=claimable->>'hash'
  //       )
  //   `);
  const { rows } = await poolQuery(`
        SELECT * FROM claimables WHERE claimable->>'kind'='Hookin'
        AND NOT EXISTS (
            SELECT * FROM statuses WHERE status->>'claimableHash'=claimable->>'hash'
        )
    `);
  for (const row of rows) {
    const hookin = hi.Hookin.fromPOD(row.claimable);
    if (hookin instanceof Error) {
      throw hookin;
    }

    console.log('trying to finalize: ', hookin.hash().toPOD());
    await processHookin(hookin);
  }

  console.log('Finalization done!');
}

run();
