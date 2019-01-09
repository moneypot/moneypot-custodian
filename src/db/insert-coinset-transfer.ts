import assert from 'assert';
import * as hi from 'hookedin-lib';

import { withTransaction } from './util';

import insertPrunedTransaction from "./insert-source-pruned-transfer";

// true = added, false = already existed
export default async function(ackTransfer: hi.AcknowledgedTransfer) {

  const transfer = ackTransfer.contents;

  const output = transfer.output;
  if (!(output instanceof hi.TransferOutput)) {
    throw new Error("assertion: function does not work with pruned output");
  }

  const inputSet = transfer.source;
  if (!(inputSet instanceof hi.SpentCoinSet)) {
    throw new Error("assertion: function only works with SpentCoinSet source");
  }

  const transferHashStr = transfer.hash().toBech();

  await withTransaction(async function(client) {

    try {
      await insertPrunedTransaction(client, ackTransfer);
    } catch (err) {
      if (err.code === '23505') { // constraint violation, must already exist
        return false;
      }
      throw err;
    }

    // TODO: this can be optimized into a single query...
    try {
      for (const coin of inputSet) {


        const res = await client.query(`INSERT INTO spent_coins(
          owner, transfer_hash, magnitude, existence_proof, spend_proof)
          VALUES($1, $2, $3, $4, $5)`,
          [
            coin.owner.toBech(),
            transferHashStr,
            coin.magnitude,
            coin.existenceProof.toBech(),
            coin.spendProof.toBech()
          ]
        );

        assert(res.rowCount === 1);
      }
    } catch(err) {
      throw err.code === '23505' ? 'COIN_ALREADY_SPENT' : err;
    }

  }); 

}
