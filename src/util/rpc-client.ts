import assert from 'assert';
import * as hi from 'hookedin-lib';

import JSONRpcClient from './jsonrpc';

//let jsonClient = new JSONRpcClient('127.0.0.1', 18332, 'testnetdev', 'l5JwLwtAXnaF');
let jsonClient = new JSONRpcClient(
  '45.76.42.51',
  18332,
  '7eb0be46532a36b1e7a2d86bac99b4d78c238fe470a3c0f86b113677e07a744b',
  'beef54c52615f195fced6b89ee4677a2324b6b34d29d79e645546e09dab161f8'
);

export async function getBalance(): Promise<number> {
  const b: number = await jsonClient.call('getbalance', {});
  return Math.round(b * 1e8);
}

// returns as hex...
export async function getRawTransaction(txid: string) {
  try {
    const transaction = await jsonClient.call('getrawtransaction', { txid, verbose: false });
    return transaction as string;
  } catch (err) {
    if (typeof err === 'string' && /Use gettransaction for wallet transactions/.test(err)) {
      const transaction = await jsonClient.call('gettransaction', { txid });
      return transaction.hex as string;
    }

    throw err;
  }
}

export async function getTxOut(transactionID: Uint8Array, vout: number) {
  assert(Number.isSafeInteger(vout) && vout >= 0);

  const txid = hi.Buffutils.toHex(transactionID);

  // Instead of calling   getTxOut directly, we are going to go through  getRawTransaction
  // the reason for this is that it works with txindex=1 for when our wallet is annoying and
  // spends the money someone declares it

  // Note this technically uses deprecated behavior (getRawTransaction is supposed to stop working with unspent tx's eventually)

  const rawTx = await getRawTransaction(txid);

  const transaction = await jsonClient.call('decoderawtransaction', { hexstring: rawTx });

  assert(transaction.txid === txid);

  const output = transaction.vout[vout];
  if (!output) {
    throw new Error('INVALID_TXID_VOUT');
  }

  const amount = Math.round(output.value * 1e8);

  assert(Number.isSafeInteger(amount) && amount > 0);

  return {
    amount,
    address: output.scriptPubKey.addresses.length === 1 ? output.scriptPubKey.addresses[0] : null,
    confirmations: transaction.confirmations,
  };
}

export async function importPrivateKey(privkey: string) {
  await jsonClient.call('importprivkey', { privkey, rescan: false });
}

export async function importPrunedFunds(transactionId: Uint8Array) {
  const txid = hi.Buffutils.toHex(transactionId);

  const rawtransaction = await getRawTransaction(txid);
  let txoutproof;
  try {
    txoutproof = await jsonClient.call('gettxoutproof', { txids: [txid] });
  } catch (err) {
    if (err.message && /Transaction not yet in block/.test(err.message)) {
      return; // it's already spent, so let's ignore
    }
    throw err;
  }

  await jsonClient.call('importprunedfunds', { rawtransaction, txoutproof });
}

export async function getFeeRate(conf_target: number, estimate_mode: 'ECONOMICAL' | 'CONSERVATIVE') {
  const res = await jsonClient.call('estimatesmartfee', { conf_target, estimate_mode });
  const r = (res['feerate'] * 1e5) / 4;
  assert(Number.isFinite(r) && r > 0);
  return r;
}

export async function getConsolidationFeeRate() {
  return await getFeeRate(144, 'ECONOMICAL');
}

export type CreateTransactionResult = { txid: string, hex: string, fee: number};

export async function createTransaction(to: string, amount: number, feeRate: number): Promise<CreateTransactionResult> {
  const inBtc = (amount / 1e8).toFixed(8);
  const fmtdFeeRate = ((feeRate / 1e8) * 4000).toFixed(8); // convert to bitcoin per 1000 vByte

  const outputs = { [to]: inBtc };

  const rawTx = await jsonClient.call('createrawtransaction', { inputs: [], outputs });
  if (typeof rawTx !== 'string') {
    throw new Error('expected rawTx from createRawTransaction to be a hex string');
  }

  const res = await jsonClient.call('fundrawtransaction', { hexstring: rawTx, options: { feeRate: fmtdFeeRate } });
  if (typeof res !== 'object') {
    throw new Error('fund raw transaction result expected object');
  }

  let { hex, fee } = res;

  if (typeof hex !== 'string') {
    throw new Error('expected transaction hex in string format');
  }

  if (typeof fee !== 'number' || fee < 0) {
    throw new Error('fee should be a number');
  }

  const feeInSats = Math.round(fee * 1e8);

  const signRes = await jsonClient.call('signrawtransactionwithwallet', { hexstring: hex });
  assert.strictEqual(signRes.complete, true);
  hex = signRes.hex;

  const decodeRes = await jsonClient.call('decoderawtransaction', { hexstring: hex });
  const { txid } = decodeRes;
  if (typeof txid !== 'string' || txid.length === 0) {
    throw new Error('expected txid to be a string');
  }

  return { txid, hex, fee: feeInSats };
}

export async function sendRawTransaction(hexstring: string): Promise<string> {
  const txHash = await jsonClient.call('sendrawtransaction', { hexstring });
  if (typeof txHash !== 'string' || txHash.length !== 64) {
    throw new Error('expected txhash as a result of createRawTransaction, got ' + txHash);
  }
  return txHash;
}

async function runner() {
  const startTime = Date.now();
  const r = await getBalance();
  console.log('Wallet has a balance of: ', r, ' [took', Date.now() - startTime, 'ms]');
}
runner();
