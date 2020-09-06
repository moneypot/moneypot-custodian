// At the very least we can consolidate inputs which can't be used with competitive feerates anymore ( 6 blocks)...?

import * as rpcClient from '../util/rpc-client';
import assert from 'assert';
import * as hi from 'moneypot-lib';
import * as config from '../config';

interface inputs {
  txid: string;
  vout: number;
}

async function run() {
  const unspent = await rpcClient.listUnspent();
  const compFee = (await rpcClient.getImmediateFeeRate()) * 561; // draw a line somewhere.
  const consFee = await rpcClient.getConsolidationFeeRate();

  let result: rpcClient.Unspent[] = [];
  for (const u of unspent) {
    if (u.amount < compFee) {
      if (u.amount > consFee * (34 * 4)) {
        result.push(u); // if the amount is lower than the consolidation fee for a single input, it is useless.
      }
    }
  }
  const inputs: inputs[] = [];
  for (const res of result) {
    inputs.push({ txid: res.txid, vout: res.vout });
  }

  const calculateAmount = () => {
    let amount: number[] = [];

    for (const a of result) {
      amount.push(a.amount);
    }
    return amount.reduce((a, b) => a + b, 0);
  };

  const calculateweight = () => {
    // get the output type for each txid.
    let weight: number[] = [];
    for (const r of result) {
      const type = hi.decodeBitcoinAddress(r.address);
      if (type instanceof Error) {
        throw type;
      }
      switch (type.kind) {
        case 'p2pkh':
          break;
        case 'p2sh':
          weight.push(config.nestedInput);
          break;
        case 'p2wpkh':
          weight.push(config.segInput);
          break;
        case 'p2wsh':
          break;
      }
    }
    weight.push(config.segwitOutput);
    weight.push(10.5 * 4); // ?

    return weight.reduce((a, b) => a + b, 0);
  };

  const changeAddress = await rpcClient.getChangeAddress();
  const outputs = { [changeAddress]: ((calculateAmount() - calculateweight() * consFee) / 1e8).toFixed(8) };
  // console.log(calculateAmount(), calculateweight(), consFee, outputs)
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
  //   console.log(decodeRes, "decoded tx")
  const txid = hi.Buffutils.fromHex(decodeRes.txid, 32);
  if (txid instanceof Error) {
    throw new Error('expected txid to be a string');
  }

  const z = await rpcClient.sendRawTransaction(signedhexstring); // should probably log this somewhere. TODO? maybe?
  console.log(`Transaction has been sent! [txid]:[${z}]`);
}

run();
