import assert from 'assert';
import * as hi from 'hookedin-lib';

import { withTransaction } from './util';

import insertTransaction from "./raw-insert-transaction";

export default async function(transaction: hi.Transaction) {
  assert(transaction.defundingOutput === undefined);


  const inputSet = transaction.source;
  if (!(inputSet instanceof hi.TransactionInputSet)) {
    throw new Error("assertion: function only works with TransactionInputSet source");
  }


  await withTransaction(async function(client) {

    try {
      await insertTransaction(client, transaction);
    } catch (err) {
      if (err.code === '23505') { // constraint violation, must already exist
        return;
      }
      throw err;
    }

    // TODO: this can be optimized into a single query...
    for (const input of inputSet) {

      const spendProof = input.spendProof;
      if (spendProof === undefined) {
        throw new Error("assertion: only works with spent coins");
      }

      const res = await client.query(`INSERT INTO transaction_inputs(
        owner, coin_magnitude, existence_proof, spend_proof, transaction_hash)
        VALUES($1, $2, $3, $4, $5)`,
        [
          input.owner,
          input.coinMagnitude,
          input.existenceProof.toBech(),
          spendProof.toBech(),
          transaction.hash().toBech()
        ]
      );

      assert(res.rowCount === 1);
    }

  });

};
