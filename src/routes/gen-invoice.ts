import * as hi from 'moneypot-lib';
import * as lightning from '../lightning/index';
import custodianInfo, { ackSecretKey } from '../custodian-info';
import { withTransaction } from '../db/util';

export default async function genInvoice(body: any) {
  if (typeof body !== 'object') {
    throw 'expected object for add invoice';
  }

  const claimant = hi.PublicKey.fromPOD(body.claimant);
  if (claimant instanceof Error) {
    throw 'expected a public key claimant';
  }

  const memo = body.memo;
  if (typeof memo !== 'string') {
    throw 'expected a string for memo';
  }

  const amount = body.amount;
  if (typeof amount !== 'number' || amount < 0 || !Number.isSafeInteger(amount)) {
    throw 'expected an natural number for amount';
  }

  if (custodianInfo.wipeDate) { 
    if (new Date(custodianInfo.wipeDate) < new Date(Date.now() + 48 * 60 * 60 * 3600)) { 
      throw "wiping in less than 2 days. Please don't deposit more funds."
    }
  }

  // we also need a transaction here, else two invoices with the same claimant could be generated, but only one can be recovered.
  // for update won't work so we also need locks here (nonexisting rows),
  return withTransaction(async (client) => { 
    const res = await client.query(
      `SELECT claimable FROM claimables WHERE claimable->>'kind'='LightningInvoice' AND claimable->>'claimant' = $1`, 
      [claimant.toPOD()]
    );
  
    if (res.rows.length === 1) {
      throw 'we already have an invoice for this claimant!';
    }
  
    const invoice = await lightning.addInvoice(claimant, memo, amount);
  
    const ackedInvoice = hi.Acknowledged.acknowledge(invoice, ackSecretKey);
  
    const pod = ackedInvoice.toPOD();
  
    try {
     await client.query(
        `INSERT INTO claimables(claimable) VALUES($1)
      `,
        [pod]
      );
    } catch (err) {
      console.error('could not run query: ', err, [ackedInvoice.hash().toPOD(), pod]);
    }
  
    return pod;
  } )
}

// (async function () {
//   const pub = hi.PrivateKey.fromRand().toPublicKey();

//   const details = { claimant: pub.toPOD(), memo: 'autogen', amount: Math.floor(Math.random() * 50000) };

//   console.log('new invoice is: ', await genInvoice(details));
// })();
