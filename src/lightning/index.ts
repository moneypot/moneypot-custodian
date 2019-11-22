import { promisify } from 'util';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import * as hi from 'hookedin-lib';

import args from './args';
import Mutex from '../mutex';

import { SendPaymentRes, LndInvoice } from './types';

const packageDefinition = protoLoader.loadSync(['lnd-rpc.proto', 'lnd-invoices.proto'], {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const packageDef = grpc.loadPackageDefinition(packageDefinition);
const lnrpc = packageDef.lnrpc as any;
const invoicesrpc = packageDef.invoicesrpc as any;

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

let sslCreds = grpc.credentials.createSsl(Buffer.from(args.cert, 'utf8'));

let macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(mArgs: any, callback: any) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', args.macaroon);
  callback(null, metadata);
});

let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

let lightning = new lnrpc.Lightning(args.host, creds);
let invoices = new invoicesrpc.Invoices(args.host, creds);

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

export async function addInvoice(claimant: hi.PublicKey, memo: string, value: number): Promise<hi.LightningInvoice> {
  const invoice = await lightningAddInvoice({ memo, value });

  return new hi.LightningInvoice(claimant, invoice.payment_request);
}

const lightningLookupInvoice = promisify((arg: { r_hash_str: string }, cb: (err: Error, x: LndInvoice) => any) =>
  lightning.lookupInvoice(arg, cb)
);

export async function lookupInvoice(r_hash_str: string): Promise<LndInvoice | undefined> {
  // TODO: how to handle failure?
  try {
    return await lightningLookupInvoice({ r_hash_str });
  } catch (err) {
    if (err.details === 'unable to locate invoice') {
      return undefined;
    }
    throw err;
  }
}

function paymentRequestToRHash(paymentRequest: string) {
  const pro = hi.decodeBolt11(paymentRequest);
  if (pro instanceof Error) {
    throw pro;
  }
  for (const tag of pro.tags) {
    if (tag.tagName === 'payment_hash') {
      return tag.data as string;
    }
  }

  throw new Error('assertion: could not find rhash in payment request: ' + paymentRequest);
}

export async function lookupInvoicebyPaymentRequest(paymentRequest: string) {
  return lookupInvoice(paymentRequestToRHash(paymentRequest));
}

const lightningSendPayment = promisify(
  (arg: { amt: number; payment_request: string; fee_limit: { fixed: number } }, cb: (err: Error, x: any) => any) =>
    lightning.sendPaymentSync(arg, cb)
);


export async function sendPayment(payment: hi.LightningPayment): Promise<SendPaymentRes> {
  return await lightningSendPayment({
    amt: payment.amount,
    payment_request: payment.paymentRequest,
    fee_limit: { fixed: payment.fee },
  });
}

const lightningCancelInvoice = promisify((arg: { payment_hash: Uint8Array }, cb: (err: Error, x: any) => any) =>
  invoices.cancelInvoice(arg, cb)
);

export async function cancelInvoice(paymentHash: string): Promise<undefined | Error> {
  const bytes = hi.Buffutils.fromHex(paymentHash);
  if (bytes instanceof Error) {
    throw bytes;
  }

  try {
    await lightningCancelInvoice({ payment_hash: bytes });
  } catch (err) {
    if (!(err instanceof Error)) {
      err = new Error(err);
    }
    return err;
  }
}

export async function cancelInvoiceByPaymentRequest(paymentRequest: string) {
  return cancelInvoice(paymentRequestToRHash(paymentRequest));
}
