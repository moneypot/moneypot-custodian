// At the very least we can consolidate inputs which can't be used with competitive feerates anymore ( 6 blocks)...?

import * as rpcClient from '../util/rpc-client';
import assert from 'assert';
import * as hi from 'moneypot-lib';
import * as config from '../config';
import * as db from '../db/util';

interface inputs {
  txid: string;
  vout: number;
}

export default async function () {
  const unspent = await rpcClient.listUnspent();
  let compFee = await rpcClient.getImmediateFeeRate();
  const consFee = await rpcClient.getConsolidationFeeRate();
  if (typeof compFee != 'number') {
    throw 'check if bitcoin core is running';
  }
  compFee * 561; // draw a line somewhere.
  if (typeof consFee != 'number') {
    throw 'check if bitcoin core is running';
  }
  if (unspent instanceof Error) {
    throw `Is bitcoin core running? ...@consolidate-funds... ${unspent}`;
  }
  if (unspent === 'BITCOIN_CORE_NOT_RESPONDING') {
    throw unspent;
  }
  let result: rpcClient.Unspent[] = [];
  for (const u of unspent) {
    if (u.amount < compFee) {
      if (u.amount > consFee * (90.75 * 4)) {
        // the cost to consolidate is bigger than the input's value!
        result.push(u);
      }
    }
  }
  const inputs: inputs[] = [];
  for (const res of result) {
    inputs.push({ txid: res.txid, vout: res.vout });
  }
  let amount: number[] = [];

  for (const a of result) {
    amount.push(a.amount);
  }
  const totalA = amount.reduce((a, b) => a + b, 0);

  let weight: number[] = [];
  for (const r of result) {
    const type = hi.decodeBitcoinAddress(r.address);
    if (type instanceof Error) {
      throw type;
    }
    switch (type.kind) {
      case 'p2pkh':
        break; // not possible
      case 'p2sh':
        weight.push(90.75 * 4);
        break;
      case 'p2wpkh':
        weight.push(67.75 * 4);
        break;
      case 'p2wsh': // not possible
        break;
    }
  }
  weight.push(31 * 4); // change
  weight.push(10.5 * 4); // w/e

  const totalW = weight.reduce((a, b) => a + b, 0);
  const changeAddress = await rpcClient.getChangeAddress();
  const outputs = { [changeAddress]: ((totalA - Math.round(Math.round(totalW) * consFee)) / 1e8).toFixed(8) };
  let hexstring = await rpcClient.jsonClient.call('createrawtransaction', {
    inputs,
    outputs,
    replaceable: true,
  });

  if (typeof hexstring !== 'string') {
    throw new Error('expected rawTx from createRawTransaction to be a hex string');
  }

  const signRes = await rpcClient.jsonClient.call('signrawtransactionwithwallet', { hexstring });
  assert.strictEqual(signRes.complete, true);

  hexstring = signRes.hex;
  let signedhexstring = signRes.hex;

  const decodeRes = await rpcClient.decodeRawTransaction(signedhexstring);
  const txid = hi.Buffutils.fromHex(decodeRes.txid, 32);
  if (txid instanceof Error) {
    throw new Error('expected txid to be a string');
  }

  const z = await rpcClient.sendRawTransaction(signedhexstring);
  await db.pool.query(
    `INSERT INTO bitcoin_transactions_manual(transaction)
VALUES($1)
`,
    [decodeRes] // TODO, not sure if this always works
  );
  console.log(`Transaction has been sent! [txid]:[${z}]`);
}
