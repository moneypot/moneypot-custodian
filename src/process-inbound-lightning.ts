import * as hi from 'hookedin-lib';
import * as lightning from './lightning/index';
import * as db from './db/util';

export default async function processInboundLightning() {
  let lastSettleIndex = 0;

  const { rows } = await db.pool.query(`SELECT * FROM lightning_invoices ORDER BY settle_index DESC LIMIT 1;`);
  if (rows.length === 1) {
    lastSettleIndex = rows[0].settle_index;
  }

  console.log('Going to subscribe to invoices. Highest processed is: ', lastSettleIndex);

  lightning.subscribeSettledInvoices(lastSettleIndex, async invoice => {
    const rHash = hi.Buffutils.toHex(invoice.r_hash);

    console.log('Marking invoice ', rHash, ' as paid: ', invoice.amt_paid_sat, 'sats #', invoice.settle_index);

    await db.pool.query(`UPDATE lightning_invoices SET settle_index = $1, settle_amount = $2 WHERE r_hash = $3`, [
      invoice.settle_index,
      invoice.amt_paid_sat,
      rHash,
    ]);
  });
}
