import assert from 'assert';
import * as hi from 'hookedin-lib';

// @ts-ignore
import BitcoinClient from 'bitcoin-core';

const config = {
  username: 'testnetdev',
  password: 'l5JwLwtAXnaF',
  host: '127.0.0.1',
  port: '18332',
  network: 'testnet',
  version: '0.17.0'
};

let client = new BitcoinClient(config);


export async function getTxOut(txid: Uint8Array, vout: number) {
  assert(Number.isSafeInteger(vout) && vout >= 0);

  // Instead of calling   getTxOut directly, we are going to go through  getRawTransaction
  // the reason for this is that it works with txindex=1 for when our wallet is annoying and
  // spends the money someone declares it

  // Note this technically uses deprecated behavior (getRawTransaction is supposed to stop working with unspent tx's eventually)

  const txidHex = hi.Buffutils.toHex(txid);

  const transaction = await client.getRawTransaction(txidHex, true);

  assert(transaction.txid === txidHex);

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
};

export async function getBalance() {
  const b = await client.getBalance();
  return Math.round(b * 1e8);
};

export async function importPrivateKey(privkey: hi.PrivateKey) {
  await client.importPrivKey(privkey.toWif(), '', false);
};


export async function importPrunedFunds(txid: Uint8Array) {
  const txidHex = hi.Buffutils.toHex(txid);

  const transaction = await client.getRawTransaction(txidHex, false);
  const proof = await client.getTxOutProof([txidHex]);

  await client.importPrunedFunds(transaction, proof);
};


export async function getFeeRate(blocks: number, mode: "ECONOMICAL" | "CONSERVATIVE") {
  const res = await client.estimateSmartFee(blocks, mode);
  return (res['feerate'] * 1e5) / 4;
}

export async function getConsolidationFeeRate() {
  return await getFeeRate(144, "ECONOMICAL");
};

export async function createTransaction(to: string, amount: number, feeRate: number) {

  const inBtc = (amount / 1e8).toFixed(8);
  const btcFeeRate = (feeRate * 4) / 1000; // convert to vByte than per 1000

  const output = { [to]: inBtc };

  console.log("Trying to send: ", output, " btc with feerate: ", btcFeeRate);

  const rawTx = await client.createRawTransaction([], output);
  if (typeof rawTx !== "string") {
    throw new Error("expected rawTx from createRawTransaction to be a hex string");
  }

  console.log("raw tx is: ", rawTx, );

  const res = await client.fundRawTransaction(rawTx, { feeRate: btcFeeRate });
  if (typeof res !== "object") {
    throw new Error("fund raw transaction result expected object");
  }

  const { hex, fee } = res;

  if (typeof hex !== "string") {
    throw new Error("expected transaction hex in string format");
  }

  if (typeof fee !== "number" || fee < 0) {
    throw new Error("fee should be a number");
  }

  const feeInSats = Math.round(fee * 1e8);


  console.log("Created a bitcoin transaction: ", hex, " with fee: ", fee);

  const { txid } = await client.decodeRawTransaction(hex);
  if (typeof txid !== "string" || txid.length === 0) {
    throw new Error("expected txid to be a string");
  }


  return { txid, hex, fee: feeInSats };
}

export async function sendRawTransaction(txHex: string) {
  const txHash = await client.sendRawTransaction(txHex);
  if (typeof txHash !== "string" && txHash.length !== 64) {
    throw new Error("expected txhash as a result of createRawTransaction, got " + txHash);
  }
}


getBalance().then(b => console.log('Wallet balance: ', b));