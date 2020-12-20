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
  };
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

interface MppRecord {
  payment_addr: string;
  total_amt_msat: string;
}

interface CustomRecords {}
interface Hop {
  chan_id: string;
  chan_capacity: string;
  amt_to_forward: string;
  fee: string;
  expiry: number;
  amt_to_forward_msat: string;
  fee_msat: string;
  pub_key: string;
  tlv_payload: boolean;
  mpp_record: MppRecord;
  custom_records: CustomRecords;
}

interface Route {
  total_time_lock: number;
  total_fees: string;
  total_amt: string;
  hops: Hop[];
  total_fees_msat: string;
  total_amt_msat: string;
}

interface Htlc {
  status: string;
  route: Route;
  attempt_time_ns: string;
  resolve_time_ns: string;
  failure?: any;
  preimage: string;
}

interface Payment {
  payment_hash: string;
  value: string;
  creation_date: string;
  fee: string;
  payment_preimage: string;
  value_sat: string;
  value_msat: string;
  payment_request: string;
  status: string;
  fee_sat: string;
  fee_msat: string;
  creation_time_ns: string;
  htlcs: Htlc[];
  payment_index: string;
  failure_reason: string;
}

export interface LightningPayments {
  payments: Payment[];
  first_index_offset: string;
  last_index_offset: string;
}

export interface GetInfo {
  uris: any;
  chains: Array<Object>;
  identity_pubkey: string;
  alias: string;
  num_pending_channels: number;
  num_active_channels: number;
  num_peers: number;
  block_height: number;
  block_hash: string;
  synced_to_chain: boolean;
  testnet: boolean;
  best_header_timestamp: number;
  version: string;
  num_inactive_channels: number;
  color: string;
  synced_to_graph: boolean;
}

export interface Channel {
  pending_htlcs: any[];
  active: boolean;
  remote_pubkey: string;
  channel_point: string;
  chan_id: any;
  capacity: number;
  local_balance: number;
  remote_balance: number;
  commit_fee: number;
  commit_weight: number;
  fee_per_kw: number;
  unsettled_balance: number;
  total_satoshis_sent: number;
  total_satoshis_received: number;
  num_updates: number;
  csv_delay: number;
  private: boolean;
  initiator: boolean;
  chan_status_flags: string;
  local_chan_reserve_sat: number;
  remote_chan_reserve_sat: number;
  static_remote_key: boolean;
}

export interface channels {
  channels: Channel[];
}

export interface Node {
  addresses: any[];
  last_update: number;
  pub_key: string;
  alias: string;
  color: string;
}

export interface LNDNodeInfo {
  channels: any[];
  node: Node;
  num_channels: number;
  total_capacity: number;
}
