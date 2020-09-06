import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

import * as rpcClient from '../util/rpc-client';

// simple script to calculate actual amount spent on fees. not 100% accurate.
// and, without additional formulas accounting for dusting etc, isn't really that useful.

let Received: number[] = []; // individual hookin fees (consolidationfees)  + individual hookout fees
let Spent: number[] = [];

async function run() {
  console.log('running query');
  // get it typed..?
  const getClaimables = await pool.query(`SELECT claimable FROM claimables`);
  for (const c of getClaimables.rows) {
    const b: hi.POD.Claimable = c.claimable;
    switch (b.kind) {
      case 'Hookout': {
        Received.push(b.fee); // Additionally, see BitcoinTransactionSent
        break;
      }
      case 'Hookin': {
        // see HookinAccepted
        break;
      }
      case 'LightningPayment': {
        // see transactionSent, this is zero-sum though.
        break;
      }
      case 'LightningInvoice': {
        // we earn nothing.
        break;
      }
      case 'FeeBump': {
        Received.push(b.amount); // see transactionSent
        break;
      }
    }
  }

  const getStatuses = await pool.query(`SELECT status from STATUSES`);
  for (const s of getStatuses.rows) {
    let b: hi.POD.Status = s.status;
    switch (b.kind) {
      case 'HookinAccepted': {
        Received.push(b.consolidationFee);
        break;
      }
      case 'BitcoinTransactionSent': {
        const a = await rpcClient.getTransaction(b.txid);
        if (a != undefined) {
          if (a.fee != undefined) {
            console.log(a.fee, Math.round(a.fee * 1e8));
            Spent.push(Math.round(a.fee * 1e8));
          }
        }
        break;
      }
      case 'LightningPaymentSent': {
        Received.push(b.totalFees); // easier than calculating the remainder and refunding that
        Spent.push(b.totalFees);
        break;
      }
      case 'InvoiceSettled': {
        break;
      }
      case 'Claimed': {
        break;
      }
    }
  }
  const z = Received.reduce((a, b) => a + b, 0);
  const y = Spent.reduce((a, b) => a + b, 0);

  console.log(
    `Calculation done! You've spent ${-y} sat on fees, and received ${z} sat, this brings the net @ ${y + z} or ${(
      (y + z) /
      1e8
    ).toFixed(8)} btc`
  );
}

run();
