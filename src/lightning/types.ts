export interface SendPaymentRes {
  payment_error: string;
  payment_preimage: Buffer;
  payment_route: {
    total_time_lock: number;
    total_fees: number;
    total_amt: number;
    hops: any[]; // todo..
    total_fees_msat: number;
    total_amt_msat: number;
  }[];
  payment_hash: Buffer;
}

export interface LndInvoice {
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
  settle_index: number; // TODO: can it be undefined? null?
  amt_paid: number;
  amt_paid_sat: number;
  amt_paid_msat: number;
  state: 'OPEN' | 'SETTLED' | 'CANCELED' | 'ACCEPTED';
}
