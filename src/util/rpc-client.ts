import assert from 'assert';
import * as hi from 'moneypot-lib';
import * as coinsayer from './coinsayer';

import JSONRpcClient from './jsonrpc';

//let jsonClient = new JSONRpcClient('127.0.0.1', 18332, 'testnetdev', 'l5JwLwtAXnaF');
// ip is not process.env'd. change manually
export let jsonClient = new JSONRpcClient(
  '127.0.0.1',
  process.env.CURRENCY! === 'tBTC' ? 18332 : 8332,
  process.env.CORE_USER!,
  process.env.CORE_PASSWORD!
);

export interface Unspent {
  txid: string;
  vout: number;
  address: string;
  amount: number;
}

export async function listUnspent(): Promise<Unspent[] | Error | 'BITCOIN_CORE_NOT_RESPONDING'> {
  let unspent;
  try {
    unspent = await jsonClient.call('listunspent', {});
    return unspent
      .filter((c: any) => c.spendable && c.confirmations > 0)
      .map((c: any) => ({
        txid: c.txid,
        vout: c.vout,
        address: c.address,
        amount: Math.round(c.amount * 1e8),
      }));
  } catch (err) {
    if (typeof err.message === 'string' && /connect ECONNREFUSED/.test(err.message)) {
      return 'BITCOIN_CORE_NOT_RESPONDING';
    }
    // general error.
    return err;
  }
}

export async function getBalance(): Promise<number> {
  const b: number = await jsonClient.call('getbalance', { minconf: 0 });
  return Math.round(b * 1e8);
}

interface ScriptSig {
  asm: string;
  hex: string;
}
// TODO move these out
interface Vin {
  txid: string;
  vout: number;
  scriptSig: ScriptSig;
  sequence: number;
}

interface ScriptPubKey {
  asm: string;
  hex: string;
  reqSigs: number;
  type: string;
  addresses: string[];
}

interface Vout {
  value: number;
  n: number;
  scriptPubKey: ScriptPubKey;
}

interface rawTx {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: Vin[];
  vout: Vout[];
  hex: string;
  blockhash: string;
  confirmations: number;
  time: number;
  blocktime: number;
}

export async function getRawTransaction(txid: string, blockhash: string | undefined, verbose: boolean) {
  let transaction;

  try {
    transaction = await jsonClient.call('getrawtransaction', {
      txid,
      verbose,
      blockhash,
    });
  } catch (e) {
    return new Error(e);
  }
  return transaction as string | rawTx;
}

// returns as hex...
export async function getSmartRawTransaction(txid: string, unspentVout?: number) {
  let blockhash;
  if (unspentVout !== undefined) {
    blockhash = await getBlockHashOfUtxo(txid, unspentVout);
    if (blockhash instanceof Error) {
      return blockhash;
    }
  }

  try {
    return getRawTransaction(txid, blockhash, false);
  } catch (err) {
    console.log('[rpc] grt didnt work');
    if (typeof err.message === 'string' && /Use gettransaction for wallet transactions/.test(err.message)) {
      console.log('[rpc] trying gtc');
      const info = await getTransaction(txid);
      if (!info) {
        return new Error('could not lookup transaction');
      }
      return info.hex;
    }

    return err;
  }
}

type TransactionInfo = {
  confirmations: number;
  fee?: number;
  blockhash?: string;
  hex: string;
};

export async function getTransaction(txid: string) {
  let txinfo;
  try {
    txinfo = await jsonClient.call('gettransaction', { txid });
  } catch (err) {
    if (err.message === 'Invalid or non-wallet transaction id') {
      return undefined;
    }
    throw err;
  }

  return txinfo as TransactionInfo;
}

export async function getTxOut(txid: string, vout: number) {
  assert(Number.isSafeInteger(vout) && vout >= 0);

  const txOutInfo = await jsonClient.call('gettxout', { txid, n: vout });
  if (!txOutInfo) {
    return undefined;
  }

  return {
    bestBlock: txOutInfo.bestblock as string,
    confirmations: txOutInfo.confirmations as number,
    amount: Math.round(txOutInfo.value * 1e8),
    address: txOutInfo.scriptPubKey.addresses.length === 1 ? (txOutInfo.scriptPubKey.addresses[0] as string) : null,
  };
}

export async function smartGetTxOut(txid: string, vout: number) {
  const r = await getTxOut(txid, vout);
  if (r !== undefined) {
    return r;
  }

  return getTxOutFromWalletTx(txid, vout);
}

type DecodeTransactionResult = {
  txid: string;
  hash: string;
  size: number;
  vsize: number;
  weight: number;
  version: number;
  locktime: number;
  vin: {
    txid: string;
    vout: number;
    scriptSig: {
      asm: string;
      hex: string;
    };
    txinwitness?: string[];
    sequence: number;
  }[];
  vout: {
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      hex: string;
      reqSigs: number;
      type: string;
      addresses: string[];
    };
  }[];
};

export async function decodeRawTransaction(hexstring: string) {
  return (await jsonClient.call('decoderawtransaction', {
    hexstring,
  })) as DecodeTransactionResult;
}

export async function getTxOutFromWalletTx(txid: string, vout: number) {
  assert(Number.isSafeInteger(vout) && vout >= 0);

  const txinfo = await getTransaction(txid);
  if (!txinfo) {
    return undefined;
  }

  const decodedInfo = await decodeRawTransaction(txinfo.hex);

  const output = decodedInfo.vout[vout];
  if (!output) {
    throw new Error('INVALID_TXID_VOUT');
  }

  const amount = Math.round(output.value * 1e8);

  assert(Number.isSafeInteger(amount) && amount > 0);

  return {
    amount,
    address: output.scriptPubKey.addresses.length === 1 ? output.scriptPubKey.addresses[0] : null,
    confirmations: txinfo.confirmations,
  };
}

type BlockChainInfo = {
  chain: 'main' | 'test' | 'regtest';
  blocks: number;
  // todo...
};
export async function getBlockChainInfo(): Promise<BlockChainInfo> {
  return await jsonClient.call('getblockchaininfo', {});
}

export async function importPrivateKey(privkey: string) {
  await jsonClient.call('importprivkey', { privkey, rescan: false });
}

export async function importPrunedFunds(transactionId: Uint8Array, vout: number) {
  const txid = hi.Buffutils.toHex(transactionId);

  console.log('trying to import: ', txid, vout);

  const rawtransaction = await getSmartRawTransaction(txid, vout);
  if (rawtransaction instanceof Error) {
    if (rawtransaction.message === 'could not find utxo') {
      console.log('imported funds already spent, skipping');
      return;
    }
    throw rawtransaction;
  }

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

export async function getFeeRate(
  conf_target: number,
  estimate_mode: 'ECONOMICAL' | 'CONSERVATIVE'
): Promise<number | Error | 'BITCOIN_CORE_NOT_RESPONDING'> {
  let res;
  try {
    res = await jsonClient.call('estimatesmartfee', {
      conf_target,
      estimate_mode,
    });
  } catch (err) {
    if (typeof err.message === 'string' && /connect ECONNREFUSED/.test(err.message)) {
      return 'BITCOIN_CORE_NOT_RESPONDING';
    }
    // general error.
    return err;
  }
  const r = (res['feerate'] * 1e5) / 4;
  assert(Number.isFinite(r) && r > 0);
  return r;
}

// TODO: improve error handling on these funcs?
export async function getDynamicFeeRate(blocks: number) {
  return await getFeeRate(blocks, 'ECONOMICAL');
}

export async function getConsolidationFeeRate() {
  return await getFeeRate(144, 'ECONOMICAL');
}

export async function getImmediateFeeRate() {
  return await getFeeRate(6, 'ECONOMICAL');
}

export async function getChangeAddress(): Promise<string> {
  return await jsonClient.call('getrawchangeaddress', {
    address_type: 'bech32',
  });
}

interface MemPoolEntry {
  fees: Fees;
  vsize: number;
  weight: number;
  fee: number;
  modifiedfee: number;
  time: number;
  height: number;
  descendantcount: number;
  descendantsize: number;
  descendantfees: number;
  ancestorcount: number;
  ancestorsize: number;
  ancestorfees: number;
  wtxid: string;
  depends: any[];
  spentby: any[];
  'bip125-replaceable': boolean;
}

interface Fees {
  base: number;
  modified: number;
  ancestor: number;
  descendant: number;
}

export async function getMemPoolEntry(txid: string): Promise<MemPoolEntry | undefined> {
  let res;
  try {
    res = await jsonClient.call('getmempoolentry', { txid });
  } catch (err) {
    console.warn('getmempoolfee error: ', err);
    return undefined; // return error instead of undefined?
  }

  return res;
}

type BumpFeeResult = {
  txid: string;
  origfee: number;
  fee: number;
  errors: string[];
};

export async function bumpFee(txid: string, confTarget: number): Promise<BumpFeeResult | Error> {
  let res: BumpFeeResult | Error;
  try {
    res = await jsonClient.call('bumpfee', {
      txid,
      options: {
        confTarget,
        replaceable: true,
      },
    });
  } catch (e) {
    res = e;
  }

  return res;
}

export function addressType(address: string) {
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return 'legacy';
  }
  if (address.startsWith('2') || address.startsWith('3')) {
    return 'p2sh';
  }
  if (address.startsWith('tb1') || address.startsWith('bc1')) {
    // lazy
    if (address.length > 42) {
      return 'p2wsh';
    }
    return 'bech32';
  }

  throw new Error('unrecognized address: ' + address);
}

export type CreateTransactionResult = {
  txid: Uint8Array;
  hex: string;
  fee: number;
  allOutputs: hi.Hookout[];
};

// feeRate of 0 means it's consolidation style feeRate
export async function createSmartTransaction(
  to: hi.Hookout,
  optionals: hi.Hookout[],
  feeRate: number,
  noChange: boolean,
  rbf: boolean
): Promise<CreateTransactionResult | Error | 'FREE_TRANSACTION_TOO_EXPENSIVE'> {
  // "BITCOIN_CORE_CRASHED" , return this as error for now. Really though, we should do something with this, (restart core..?)

  let unspent = await listUnspent();
  // we need to return else we cannot fail the function
  if (unspent instanceof Error || unspent === 'BITCOIN_CORE_NOT_RESPONDING') {
    return unspent instanceof Error ? unspent : new Error('BITCOIN_CORE_CRASHED');
  }

  if (unspent.length === 0) {
    return new Error('[INTERNAL ERROR]: NO_INPUTS_AVAILABLE');
  }

  let fixedConsolidationFeeRate = await getConsolidationFeeRate();

  if (fixedConsolidationFeeRate instanceof Error || fixedConsolidationFeeRate === 'BITCOIN_CORE_NOT_RESPONDING') {
    return fixedConsolidationFeeRate instanceof Error ? fixedConsolidationFeeRate : new Error('BITCOIN_CORE_CRASHED');
  }

  let consolidationFeeRate = Math.ceil(fixedConsolidationFeeRate);
  if (feeRate === 0) {
    feeRate = Math.max(0.25, consolidationFeeRate * 0.9); // we can't send less than 1 sat/vbyte
  }

  const multisig = 128;
  const segwitmultiWeight = 43 * 4;
  const nativeWeight = 124;
  const legacyWeight = 136;
  const nativeInputWeight = 67.75 * 4;
  const wrappedSegwitWeight = 90.75 * 4; // TODO, this doesn't match?

  const p: coinsayer.Problem = {
    minFeeRate: Math.ceil(feeRate), // we have to provide whole integers.....
    consolidationFeeRate,
    // 10.5 ?
    fixedWeight: 42,
    changeWeight: noChange ? 1e6 : nativeWeight, // make it stupid to pick change..
    changeSpendWeight: nativeInputWeight,
    minAbsoluteFee: 0,
    maxInputsToSelect: 50,
    minChangeAmount: 54600, // super overkill
    timeout: 10, // second
    mandatoryInputConflicts: [],
    inputs: unspent.map(c => ({
      identifier: `${c.txid}_${c.vout}`,
      weight: addressType(c.address) === 'bech32' ? nativeInputWeight : wrappedSegwitWeight,
      amount: c.amount,
    })),
    outputs: [
      {
        identifier: 'dest',
        weight:
          addressType(to.bitcoinAddress) === 'bech32'
            ? nativeWeight
            : addressType(to.bitcoinAddress) === 'p2sh'
            ? multisig
            : addressType(to.bitcoinAddress) === 'legacy'
            ? legacyWeight
            : addressType(to.bitcoinAddress) === 'p2wsh'
            ? segwitmultiWeight
            : 128,
        amount: to.amount,
        requirement: 'M',
      },
      ...optionals.map(h => ({
        identifier: h.hash().toPOD(),
        weight:
          addressType(h.bitcoinAddress) === 'bech32'
            ? nativeWeight
            : addressType(h.bitcoinAddress) === 'p2sh'
            ? multisig
            : addressType(h.bitcoinAddress) === 'legacy'
            ? legacyWeight
            : addressType(to.bitcoinAddress) === 'p2wsh'
            ? segwitmultiWeight
            : 128,
        amount: h.amount,
        requirement: 'P',
      })),
    ],
  };
  console.log('calling claimsayer: ', p);
  let editRes: Error | coinsayer.Selection;
  try {
    editRes = await coinsayer.req(p);
  } catch (err) {
    editRes = err;
  }

  if (editRes instanceof Error) {
    if (editRes.message === 'status not 200') {
      // we could cancel for this before even calling coinsayer.
      return new Error(
        '[INTERNAL ERROR]: Coinsayer did not give a valid response. Most likely we were unable to create an economically feasible transaction! Try again after the next block!'
      );
    } else {
      console.log(`[warn]: ${editRes.message}`); // log the error..?
      return new Error(
        `[INTERNAL ERROR]: We experienced problems with our coinselection. Please contact our support if the problem persists!`
      );
    }
  }

  // uhhh, if editres === "coin selection error, hm. ask me for logs"
  if (typeof editRes.changeAmount != 'number') {
    return new Error('[INTERNAL ERROR]: Coinsayer did not give a valid response.');
  }

  // intended for now: Identical adresses = added weight == higher fees... not

  // let's allow for only 1 sat difference at most between the claimed amount and the actual send amount, we do this because of integer $hit. TODO
  if (editRes.changeAmount != 0) {
    const newFee = feeRate * editRes.weight;

    const respFee = editRes.miningFee - editRes.changeAmount;
    editRes.changeAmount = Math.floor(editRes.changeAmount + respFee - newFee);
  }

  const res = editRes;

  console.log('got coinsayer result: ', res);

  if (noChange) {
    if (res.changeAmount !== 0) {
      console.warn('coinsayer tried to pick change, even when we made it stupid :(');
      // throw, because we don't want to fail these free transactions, instead we keep adding them up until we can create a valid nochange tx.
      return 'FREE_TRANSACTION_TOO_EXPENSIVE'; // TODO: better support for this directly in coinsayer...
    }
    // this coinsayer integer bullshit is killing me.
    if (res.miningFee / res.weight > Math.ceil(consolidationFeeRate) * 1.01) {
      // ceil, else it will always fail? TODO
      console.warn('coinsayer couldnt find a no-change solution without too much sacrifice');
      return 'FREE_TRANSACTION_TOO_EXPENSIVE';
    }
  }

  const inputs = res.inputs.map(id => {
    const [txid, vout] = id.split('_');
    return { txid, vout: Number.parseInt(vout) };
  });
  const optLookups = new Map<string, hi.Hookout>();
  for (const optHookout of optionals) {
    optLookups.set(optHookout.hash().toPOD(), optHookout);
  }

  const allOutputs: hi.Hookout[] = [];

  for (const o of res.outputs) {
    if (o === 'dest') {
      allOutputs.push(to);
      continue;
    }

    const identifier = optLookups.get(o);
    if (!identifier) {
      throw new Error('could not find opt hookout: ' + identifier);
    }
    allOutputs.push(identifier);
  }

  // we do not interact with the initial hookins, thus we don't need a deep copy
  const rest = Array.from(
    allOutputs.reduce(
      (m, { bitcoinAddress, amount }) => m.set(bitcoinAddress, (m.get(bitcoinAddress) || 0) + amount),
      new Map()
    ),
    ([bitcoinAddress, amount]) => ({ bitcoinAddress, amount })
  );

  const outputs = Object.entries(rest).map(([k, obj]) => {
    return { [obj.bitcoinAddress]: `${(obj.amount / 1e8).toFixed(8)}` };
  });

  if (res.changeAmount > 0) {
    const changeAddress = await getChangeAddress();
    const change = { [changeAddress]: (res.changeAmount / 1e8).toFixed(8) };
    outputs.push(change);
  }
  let hexstring = await jsonClient.call('createrawtransaction', {
    inputs,
    outputs,
    replaceable: rbf,
  });

  if (typeof hexstring !== 'string') {
    return new Error('[INTERNAL ERROR]: expected rawTx from createRawTransaction to be a hex string');
  }
  const signRes = await jsonClient.call('signrawtransactionwithwallet', { hexstring });
  if (signRes.complete != true) {
    return new Error('[INTERNAL ERROR]: Expected signRes to be complete @ CreateSmartTransaction');
  }
  hexstring = signRes.hex;

  const decodeRes = await decodeRawTransaction(hexstring);
  const txid = hi.Buffutils.fromHex(decodeRes.txid, 32);
  if (txid instanceof Error) {
    return new Error('[INTERNAL ERROR]: expected txid to be a string');
  }

  return { txid, hex: hexstring, fee: res.miningFee, allOutputs };
}

// a placeholder for custodians that do not have access to in-house coin selection algorithms/tools that follow Coinsayer's standard.
// NOTE: This will spend unconfirmed change inputs unless spendzeroconfchange=0
export async function createNormalTransaction(
  to: hi.Hookout,
  optionals: hi.Hookout[],
  feeRate: number,
  noChange: boolean,
  rbf: boolean
): Promise<CreateTransactionResult | Error | 'FREE_TRANSACTION_TOO_EXPENSIVE'> {
  const changeAddress = await getChangeAddress();
  const allOutputs = [...optionals, to];
  const consolidationFeerate = await getConsolidationFeeRate();
  if (consolidationFeerate instanceof Error || consolidationFeerate === 'BITCOIN_CORE_NOT_RESPONDING') {
    return consolidationFeerate instanceof Error ? consolidationFeerate : new Error('BITCOIN_CORE_CRASHED');
  }
  const res = Array.from(
    allOutputs.reduce(
      (m, { bitcoinAddress, amount }) => m.set(bitcoinAddress, (m.get(bitcoinAddress) || 0) + amount),
      new Map()
    ),
    ([bitcoinAddress, amount]) => ({ bitcoinAddress, amount })
  );

  const outputs = Object.entries(res).map(([k, obj]) => {
    return { [obj.bitcoinAddress]: `${(obj.amount / 1e8).toFixed(8)}` };
  });

  const inputs = await listUnspent();

  if (inputs instanceof Error || inputs === 'BITCOIN_CORE_NOT_RESPONDING') {
    return inputs instanceof Error ? inputs : new Error('BITCOIN_CORE_CRASHED');
  }

  if (inputs.length === 0) {
    return new Error('[INTERNAL ERROR]: NO_INPUTS_AVAILABLE');
  }
  let hexstring = await jsonClient.call('createrawtransaction', { inputs, outputs, replaceable: rbf });
  // now that we have a raw transaction, we fund it and add a change address.
  // const th = await decodeRawTransaction(hexstring);
  if (typeof hexstring !== 'string') {
    return new Error('[INTERNAL ERROR]: expected rawTx from createRawTransaction to be a hex string');
  }

  // convert from sats per byte to total amount...
  const btcFeerate = ((feeRate / 1e5) * 4).toFixed(8);

  let fundrawtransaction;
  // can we fix this without choosing the inputs yourself?
  noChange
    ? (fundrawtransaction = await jsonClient.call('fundrawtransaction', {
        hexstring,
        options: {
          replaceable: rbf,
          feeRate: btcFeerate,
        },
      }))
    : (fundrawtransaction = await jsonClient.call('fundrawtransaction', {
        hexstring,
        options: {
          changeAddress: changeAddress,
          replaceable: rbf,
          feeRate: btcFeerate,
        },
      }));

  // free transaction, make sure we are not paying stupid fees.
  if (noChange) {
    const decoded = await decodeRawTransaction(fundrawtransaction.hex);
    // sum up the vin an vout fields
    let spent: number[] = [];
    for (const vo of decoded.vout) {
      spent.push(vo.value * 1e8);
    }
    let inputs: number[] = [];
    // inputs have no value
    for (const vi of decoded.vin) {
      const gettxout = await getTxOutFromWalletTx(vi.txid, vi.vout);
      if (gettxout === undefined) {
        return new Error('One or more inputs were not found!');
      }
      inputs.push(gettxout.amount);
    }

    const fees =
      inputs.reduce((previous, current) => previous + current, 0) -
      spent.reduce((previous, current) => previous + current, 0);

    // this is basically a problem we're trying to solve with each free transaction being added. I'm not sure if this actually works.
    if (fees / decoded.weight > consolidationFeerate * 1.01) {
      return new Error('NO_SOLUTION_FOUND_NOCHANGE');
    }
    if (decoded.vout.length != outputs.length) {
      // we have change while we don't want to..
      return new Error('NO_SOLUTION_FOUND_NOCHANGE');
    }
  }

  if (typeof fundrawtransaction.hex !== 'string') {
    return new Error('[INTERNAL ERROR]: expected rawTx from fundrawtransaction to be a hex string');
  }

  const signRes = await jsonClient.call('signrawtransactionwithwallet', {
    // just so users know what we're passing:
    hexstring: fundrawtransaction.hex,
  });

  if (signRes.complete != true) {
    return new Error('[INTERNAL ERROR]: Signing failed @ createNormalTransaction');
  }

  let signedhexstring = signRes.hex;

  const decodeRes = await decodeRawTransaction(signedhexstring);
  const txid = hi.Buffutils.fromHex(decodeRes.txid, 32);

  if (txid instanceof Error) {
    return new Error('[INTERNAL ERROR]: expected txid to be a string');
  }

  return { txid, hex: signedhexstring, fee: feeRate, allOutputs };
}

export async function getBlockHash(height: number) {
  const res = await jsonClient.call('getblockhash', { height });
  return res as string;
}

export async function getBlock(blockhash: string) {
  const res = await jsonClient.call('getblock', { blockhash });

  return {
    hash: res.hash as string,
    confirmations: res.confirmations as number,
    height: res.height as number,
  };
}

// undefined if it's not in a block
async function getBlockHashOfUtxo(txid: string, vout: number): Promise<string | undefined | Error> {
  const info = await getTxOut(txid, vout);
  if (!info) {
    return new Error('could not find utxo');
  }
  if (info.confirmations <= 0) {
    return undefined;
  }

  const block = await getBlock(info.bestBlock);
  if (block.confirmations < 0) {
    console.warn('[warning] best block was orphaned, retrying...');
    return getBlockHashOfUtxo(txid, vout);
  }

  const newHeight = block.height - info.confirmations + 1;
  return getBlockHash(newHeight);
}

export async function sendRawTransaction(hexstring: string): Promise<string | Error> {
  const txHash = await jsonClient.call('sendrawtransaction', { hexstring });
  if (typeof txHash !== 'string' || txHash.length !== 64) {
    return new Error('expected txhash as a result of createRawTransaction, got ' + txHash);
  }
  return txHash;
}

async function runner() {
  const startTime = Date.now();
  const r = await getBalance();
  console.log('Wallet has a balance of: ', r, ' [took', Date.now() - startTime, 'ms]');
}
runner();
