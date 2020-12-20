// After a LND / BTCD crash, users may have requested Lightning Payments. run this on startup to fail all these payments.
import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

import * as rpcClient from '../util/rpc-client';
import * as lightning from '../lightning';
import * as dbStatus from '../db/status';
import StatusFailed from 'moneypot-lib/dist/status/failed';
import LightningPaymentSent from 'moneypot-lib/dist/status/lightning-payment-sent';

// if LND has crashed and people try to send LND payments -- this does not handle edge-cases.. TODO
export default async function run() {
  console.log('running query');
  const getClaimables = await pool.query(`SELECT claimable FROM claimables WHERE claimable->>'kind' = 'LightningPayment' 
    AND (claimable->>'hash') NOT IN (SELECT (status->>'claimableHash') FROM statuses WHERE (status->>'kind' = 'LightningPaymentSent' OR status->>'kind' = 'Failed'))
    `);
  const listPayments = await lightning.getListedPayments(); // catch this?!
  for (const c of getClaimables.rows) {
    const b: hi.POD.LightningPayment = c.claimable;
    const hash = hi.Hash.fromPOD(b.hash);
    if (hash instanceof Error) {
      throw hash;
    }

    let skip = false;
    // Check if we have the payment in listpayments..
    for (const payment of listPayments.payments) {
      if (b.paymentRequest === payment.payment_request) {
        console.log(
          `[INTERNAL_ERROR] [MANUAL INTERVENTION NEEDED]: ERR; found a state for ${b.paymentRequest}, which is not recorded in DB. `
        );
        skip = true;
        break;
      }
    }
    if (!skip) {
      await dbStatus.insertStatus(
        new StatusFailed(
          hash,
          `payment has been manually marked as failed @ ${new Date()} (We did not find any state in LND, must have failed!)`,
          b.fee + b.amount - 100 // prevent DOS/request spam
        )
      );
    }
  }
}

run();
