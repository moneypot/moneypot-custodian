import * as hi from 'hookedin-lib';
import * as lightningTypes from './lightning/types';

export type InvoiceSettled = {
  kind: 'InvoiceSettled';
  lndInvoice: { [K in keyof lightningTypes.LndInvoice]: lightningTypes.LndInvoice[K] extends Buffer ? string : lightningTypes.LndInvoice[K] }
}

export type Status =
  | {
      kind: 'LightningPaymentFailed';
    }
  | {
      kind: 'LightningPaymentSucceeded';
      result: lightningTypes.SendPaymentRes;
    }
  | {
      kind: 'FeebumpFailed';
      error: string;
    }
  | {
      kind: 'FeebumpSucceeded';
      newTxid: string;
    }
  | {
      kind: 'HookoutFailed';
      error: string;
    }
  | {
      kind: 'HookoutSucceeded';
      txid: string;
    }
  | {
      kind: 'Claimed';
      claim: hi.POD.Acknowledged & hi.POD.ClaimResponse;
      amount: hi.POD.Amount;
    }
  | InvoiceSettled;
