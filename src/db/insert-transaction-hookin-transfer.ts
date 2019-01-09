import assert from 'assert';
import * as hi from 'hookedin-lib';

import { withTransaction } from './util';

import insertPrunedTransaction from "./insert-source-pruned-transfer";

export default async function(ackedTransfer: hi.AcknowledgedTransfer, depositAddress: string, amount: number, fee: number) {
  assert(Number.isInteger(amount) && amount > 0);
  assert(Number.isInteger(fee) && fee >= 0);

  const transfer = ackedTransfer.contents;

  const hookin = transfer.source;
  if (!(hookin instanceof hi.TransactionHookin)) {
    throw new Error("assertion: function only works with hookin source");
  }


  try {
    await withTransaction(async function(client) {

      await insertPrunedTransaction(client, ackedTransfer);

      const res = await client.query(
        `
            INSERT INTO transaction_hookins(hash, transfer_hash, txid, vout, credit_to, derive_index, tweak, deposit_address, amount, fee)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)       
            `,
        [
          hookin.hash().toBech(),
          transfer.hash().toBech(),
          hi.Buffutils.toHex(hookin.txid),
          hookin.vout,
          hookin.creditTo.toBech(),
          hookin.deriveIndex,
          hookin.tweak.toBech(),
          depositAddress,
          amount,
          fee,
        ]
      );

      assert(res.rowCount === 1);
    });
  } catch (err) {
    if (err.code === '23505') {
      // constraint violation, must already exist
      return;
    }
    console.error('uncaught error: ', err, err.code);

    throw err;
  }
};
