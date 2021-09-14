import http from 'http';

import info from './info';
import genNonces from './gen-nonces';
import claim from './claim';
import coin from './coin';
import feeSchedule from './fee-schedule';
import genInvoice from './gen-invoice';
import lightningInvoiceByClaimant from './lightning-invoice-by-claimant';

import readJson from '../util/read-json';
import addClaimable from './add-claimable';
import getStatusesByClaimable from './get-statuses-by-claimable';
import getClaimableByInputOwner from './get-claimable-by-input-owner';
import { getLightningData } from './get-lightning-data';
import getEstimateCustomFee from './estimate-custom-fee';
import ackCustodianInfo from './ack-custodian-info';
import { constTime, cachedData, DataLimiter, ipCheckConst } from '../db/util';
import getDynamicFees from './get-dynamic-fees';

// Constant timing here is really lazy and may influence performance/response times a lot. better to move it directly onto the operations themselves.
// TODO.
const ackCustodianInfoConstTime = constTime('ackCustodianInfoConstTime');

const nonceConstTime = constTime('genNonceconstTime');
const genInvoiceConstTime = constTime('genInvoiceConstTime');
const claimConstTime = constTime('claimConstTime');
const addClaimableConstTime = constTime('addClaimableConstTime');

const estimateFeeCached = cachedData('estimateFeeCached', 300000);
const LightningDataCached = cachedData('LighntingDataCached', 300000);

const InvoiceLimiter = DataLimiter('invoiceDataLimiter', 3, 300000); // 3 per ip per 5 minutes

export default async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {
  const url = req.url;
  if (url === undefined) {
    throw new Error('404: missing url');
  }

  switch (url) {
    case '/':
      return info(); // constant
    case '/fee-schedule': // PURE API_QUERY - IMMEDIATE REQ - (NOT CACHEABLE!)
      return feeSchedule();
    case '/estimate-custom-fee': // PURE API_QUERY - INFORMATION - (CACHEABLE!)
      return estimateFeeCached(getEstimateCustomFee);
    case '/inbound-outbound-capacity-lightning/': // PURE API_QUERY - INFORMATION - (CACHEABLE!)
      return LightningDataCached(getLightningData);
  }
  if (url.startsWith('/fee-rate/')) {
    // PURE API_QUERY
    return getDynamicFees(url);
  } else if (url.startsWith('/claimable-by-input-owner/')) {
    // PURE API_QUERY
    return getClaimableByInputOwner(url);
  } else if (url.startsWith('/statuses-by-claimable/')) {
    // PURE API_QUERY
    return getStatusesByClaimable(url);
  } else if (url.startsWith('/coin/')) {
    // PURE API_QUERY
    return coin(url);
  } else if (url.startsWith('/lightning-invoices-by-claimant/')) {
    // PURE API_QUERY
    return lightningInvoiceByClaimant(url);
  } else if (url.startsWith('/ack-custodian-info')) {
    // INVOLVES_SECRETS
    return ackCustodianInfoConstTime(() => {
      return ackCustodianInfo(url);
    });
  } else if (url.startsWith('/tor-check')) { 
    return ipCheckConst(req)
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    switch (url) {
      case '/gen-nonces': // INVOLVES_SECRETS
        return nonceConstTime(() => {
          return genNonces(body);
        });
      case '/gen-invoice': // INVOLVES_SECRETS, IS EXPENSIVE!
        return InvoiceLimiter(req, () => {
          return genInvoiceConstTime(() => {
            return genInvoice(body);
          });
        });
      case '/claim': // INVOLVES_SECRETS
        return claimConstTime(() => {
          return claim(body);
        });
      case '/add-claimable': // INVOLVES_SECRETS
        return addClaimableConstTime(() => {
          return addClaimable(body);
        });
    }
  }
  console.log('route note found...', url);
}
