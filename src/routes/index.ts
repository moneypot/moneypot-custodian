import http from 'http';

import info from './info';
import genNonces from './gen-nonces';
import claim from './claim';
import sendHookout from './send-hookout';
import sendLightning from './send-lightning';
import getClaimable from './get-claimable';
import coin from './coin';
import feeSchedule from './fee-schedule';
import addInvoice from './add-invoice';
import lightningInvoiceByClaimant from './lightning-invoice-by-claimant';

import readJson from '../util/read-json';

export default async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {
  const url = req.url;
  if (url === undefined) {
    throw new Error('404: missing url');
  }

  switch (url) {
    case '/info':
      return info();
    case '/fee-schedule':
      return feeSchedule();
  }
  if (url.startsWith('/claimables/')) {
    return getClaimable(url);
  } else if (url.startsWith('/coin/')) {
    return coin(url);
  } else if (url.startsWith('/lightning-invoices/claimants/')) {
    return lightningInvoiceByClaimant(url);
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    switch (url) {
      case '/gen-nonces':
        return genNonces(body);
      case '/claim':
        return claim(body);
      case '/send-hookout':
        return sendHookout(body);
      case '/send-lightning':
        return sendLightning(body);
      case '/add-invoice':
        return addInvoice(body);
    }
  }
}
