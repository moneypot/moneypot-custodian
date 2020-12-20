declare module 'lnd-grpc' {
  import { EventEmitter } from 'events';

  class WalletUnlocker {
    unlockWallet(args: { wallet_password: Buffer }): Promise<void>;
  }

  class Lightning extends EventEmitter {
    walletBalance(): Promise<{ total_balance: number; confirmed_balance: number; unconfirmed_balance: 0 }>;
    addInvoice(args: {
      memo: string | undefined;
      value: number;
    }): Promise<{ r_hash: Buffer; payment_request: string; add_index: number }>;
    listInvoices(): Promise<any[]>;

    lookupInvoice(): Promise<any>;
    subscribeInvoices(args: { settle_index: number }): Promise<void> & EventEmitter;
  }

  class Autopilot {}

  class Invoices {}

  class Router {}

  export default class LndGrpc extends EventEmitter {
    constructor(opts: { host: string; cert: string; macaroon: string });

    connect(): Promise<void>;
    disconnect(): Promise<void>;

    state: 'active' | 'locked';

    services: {
      WalletUnlocker: WalletUnlocker;
      Lightning: Lightning;
      Autopilot: Autopilot;
      Invoices: Invoices;
      Router: Router;
    };
  }
}
