import LndGrpc from 'lnd-grpc';
import * as hi from 'hookedin-lib';

import assert from 'assert';

import args from './args';

const grpc = new LndGrpc(args);

let ready = new Promise((resolve, reject) => {
  (async function() {
    // Do something cool when the wallet gets unlocked.
    grpc.on(`active`, () => {
      console.log('wallet unlocked!');
      resolve();
    });

    // Do something cool if we detect that the wallet is locked.
    grpc.on(`locked`, () => console.log('wallet locked!'));

    // Do something cool when the connection gets disconnected.
    grpc.on(`disconnected`, () => console.log('disconnected from lnd!'));

    // Establish a connection.
    await grpc.connect();

    // Check if the wallet is locked and unlock if needed.
    if (grpc.state === 'locked') {
      const { WalletUnlocker } = grpc.services;
      await WalletUnlocker.unlockWallet({
        wallet_password: Buffer.from('password'),
      });
    }
  })().catch(reject);
});

export async function getBalance() {
  await ready;

  return grpc.services.Lightning.walletBalance();
}

export async function addInvoice(
  beneficary: hi.PublicKey,
  memo: string,
  value: number
): Promise<[hi.LightningInvoice, string]> {
  assert(Number.isInteger(value) && value >= 0);

  await ready;

  const invoice = await grpc.services.Lightning.addInvoice({ memo, value });
  const rHash = hi.Buffutils.toHex(invoice.r_hash);

  return [new hi.LightningInvoice(beneficary, invoice.payment_request), rHash];
}

export async function subscribeSettledInvoices(lastSettled: number, cb: (invoice: any) => void) {
  // We are going to miss the first settlement!
  // https://github.com/lightningnetwork/lnd/issues/2469
  if (lastSettled === 0) {
    lastSettled = 1;
  }

  await ready;

  // grpc.services.Lightning.on('data', (x) => {

  //   console.log('subscribeInvoices.data: ', x);

  const call = grpc.services.Lightning.subscribeInvoices({ settle_index: lastSettled });

  return new Promise(resolve => setTimeout(resolve, 2000));
}

(async function() {
  console.log('lightning wallet balance: ', await getBalance());
})();
