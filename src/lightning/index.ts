import { promisify } from 'util';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import * as hi from 'hookedin-lib';

import args from './args';
import Mutex from '../mutex';

import { SendPaymentRes, LndInvoice } from './types';

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

let macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(mArgs: any, callback: any) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', args.macaroon);
  callback(null, metadata);
});

let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);
let lightning = new lnrpc.Lightning(args.host, creds);

const notifMutex = new Mutex();

export function subscribeSettledInvoices(lastSettled: number, cb: (invoice: LndInvoice) => Promise<void>) {
  return new Promise(resolve => {
    // We are going to miss the first settlement!
    // https://github.com/lightningnetwork/lnd/issues/2469
    if (lastSettled === 0) {
      lastSettled = 1;
    }

    let canceled = false;

    const call = lightning.subscribeInvoices({ settle_index: lastSettled });

    call.on('data', function(invoice: LndInvoice) {
      notifMutex.runExclusive(async () => {
        if (canceled || invoice.state !== 'SETTLED') return;

        try {
          await cb(invoice);
        } catch (err) {
          console.error('notif error: ', err, ' unsubscribing');
          call.cancel();
          canceled = true;
        }
        
      });
    });
    call.on('end', function() {
      // The server has closed the stream
      // let's let everything currently running to process and tell the caller to restart
      console.warn('lnd closed subscribe stream');
      notifMutex.runExclusive(async () => {
        resolve();
      });
    });
    call.on('error', (err: any) => {
      console.warn('lnd stream closed: ', err);
    });
  });
}

const lightningAddInvoice = promisify((arg: { memo: string; value: number }, cb: (err: Error, x: any) => any) =>
  lightning.addInvoice(arg, cb)
);

export async function addInvoice(
  claimant: hi.PublicKey,
  memo: string,
  value: number
): Promise<hi.LightningInvoice> {
  const invoice = await lightningAddInvoice({ memo, value });

  return new hi.LightningInvoice(claimant, invoice.payment_request);
}

const lightningLookupInvoice = promisify((arg: { r_hash_str: string; }, cb: (err: Error, x: LndInvoice) => any) =>
  lightning.lookupInvoice(arg, cb)
);

export async function lookupInvoice(
  r_hash_str: string
): Promise<LndInvoice> { // TODO: how to handle failure?
  return await lightningLookupInvoice({ r_hash_str });
}

const lightningSendPayment = promisify(
  (arg: { amt: number; payment_request: string; fee_limit: { fixed: number } }, cb: (err: Error, x: any) => any) =>
    lightning.sendPaymentSync(arg, cb)
);

export async function sendPayment(payment: hi.LightningPayment, feeLimit: number): Promise<Error | SendPaymentRes> {
  let sendRes;
  try {
    sendRes = await lightningSendPayment({
      amt: payment.amount,
      payment_request: payment.paymentRequest,
      fee_limit: { fixed: feeLimit },
    });
  } catch (err) {
    // just being paranoid and making sure it's an error
    if (err instanceof Error) {
      return err;
    } else {
      throw err;
    }
  }

  console.log('after sending a lightningPayment, got the result: ', sendRes);

  return sendRes;
}
