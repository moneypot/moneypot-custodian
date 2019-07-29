import * as hi from 'hookedin-lib';
import * as lightning from './lightning/index';
import * as db from './db/util';

export default async function processInboundLightning() {
  
  while (true) {
    let lastSettleIndex = 0;

    const { rows } = await db.pool.query(
      `SELECT * FROM lightning_invoices ORDER BY settle_index DESC NULLS LAST LIMIT 1;`
    );
    if (rows.length === 1) {
      lastSettleIndex = rows[0].settle_index || 0;
    }
  
    console.log('Going to subscribe to invoices. Highest processed is: ', lastSettleIndex);
  
    await lightning.subscribeSettledInvoices(lastSettleIndex, async invoice => {
      const rHash = hi.Buffutils.toHex(invoice.r_hash);
      const rPreimage = hi.Buffutils.toHex(invoice.r_preimage);
  
      console.log('Marking invoice ', rHash, ' as paid: ', invoice.amt_paid_sat, 'sats #', invoice.settle_index);
  
      await db.pool.query(
        `UPDATE lightning_invoices SET
        r_preimage = $1,
        settle_index = $2,
        settle_amount = $3
        WHERE r_hash = $4`,
        [rPreimage, invoice.settle_index, invoice.amt_paid_sat, rHash]
      );
    });

    console.log('[lnd] subscribe failed, restarting');
  }

}
