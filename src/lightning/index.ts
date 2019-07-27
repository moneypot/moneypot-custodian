import grpc from 'grpc';
import { promisify } from 'util';

import * as protoLoader from '@grpc/proto-loader';

import * as hi from 'hookedin-lib';

import args from './args';
import Mutex from '../mutex';

const packageDefinition = protoLoader.loadSync('lnd-rpc.proto', {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc as any;
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

let sslCreds = grpc.credentials.createSsl(Buffer.from(args.cert, 'utf8'));

let macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(mArgs, callback) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', args.macaroon);
  callback(null, metadata);
});

let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);
let lightning = new lnrpc.Lightning(args.host, creds);

interface LndInvoice {
  route_hints: Array<any>;
  memo: string;
  receipt: Buffer;
  r_preimage: Buffer;
  r_hash: Buffer;
  value: number;
  settled: boolean;
  creation_date: number;
  settle_date: number;
  payment_request: string;
  description_hash: Buffer;
  expiry: number;
  fallback_addr: string;
  cltv_expiry: number;
  private: boolean;
  add_index: number;
  settle_index: number;
  amt_paid: number;
  amt_paid_sat: number;
  amt_paid_msat: number;
  state: 'OPEN' | 'SETTLED' | 'CANCELED' | 'ACCEPTED';
}

const notifMutex = new Mutex();

export function subscribeSettledInvoices(lastSettled: number, cb: (invoice: LndInvoice) => Promise<void>) {
  // We are going to miss the first settlement!
  // https://github.com/lightningnetwork/lnd/issues/2469
  if (lastSettled === 0) {
    lastSettled = 1;
  }

  let canceled = false;

  const call = lightning.subscribeInvoices({ settle_index: lastSettled });

  call.on('data', function(invoice: LndInvoice) {
    if (invoice.state === 'SETTLED') {
      (async function() {
        const releaser = await notifMutex.acquire();
        if (canceled) return;

        try {
          await cb(invoice);
        } catch (err) {
          console.error('notif error: ', err, ' unsubscribing');
          call.cancel();
          canceled = true;
        }

        releaser();
      })();
    }
  });
  call.on('status', function(status: any) {
    // The current status of the stream.
    console.log('lightning subscribe invoice status: ', status);
  });
  call.on('end', function() {
    // The server has closed the stream.
    console.log('lnd closed subscribe stream');
  });
  call.on('error', (err: any) => console.log('lnd subscribe error: ', err));
}

const lightningAddInvoice = promisify((arg: { memo: string; value: number }, cb: (err: Error, x: any) => any) =>
  lightning.addInvoice(arg, cb)
);

export async function addInvoice(
  claimant: hi.PublicKey,
  memo: string,
  value: number
): Promise<[hi.LightningInvoice, string]> {
  const invoice = await lightningAddInvoice({ memo, value });

  console.log('got add invoice response: ', invoice);

  const rHash = hi.Buffutils.toHex(invoice.r_hash);

  return [new hi.LightningInvoice(claimant, invoice.payment_request), rHash];
}

const lightningSendPayment = promisify(
  (arg: { amt: number; payment_request: string; fee_limit: { fixed: number } }, cb: (err: Error, x: any) => any) =>
    lightning.sendPaymentSync(arg, cb)
);

export async function sendPayment(payment: hi.LightningPayment, feeLimit: number) {
  const sendRes = await lightningSendPayment({
    amt: payment.amount,
    payment_request: payment.paymentRequest,
    fee_limit: { fixed: feeLimit },
  });

  console.log('after sending a lightningPayment, got the result: ', sendRes);
}
