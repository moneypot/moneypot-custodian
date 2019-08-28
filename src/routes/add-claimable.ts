import * as hi from 'hookedin-lib';

import sendFeeBump from './send-feebump';
import sendHookout from './send-hookout';
import sendLightning from './send-lightning';

export default async function addClaimable(body: any): Promise<hi.POD.Claimable & hi.POD.Acknowledged> {
  const claimable = hi.Claimable.fromPOD(body);
  if (claimable instanceof Error) {
    throw 'could not parse claimable';
  }

  const {c} = claimable;

  if (c instanceof hi.LightningInvoice) {
    throw 'cant add a lightinginvoice, gen one instead';
  } else if (c instanceof hi.Hookin) {
    throw new Error('todo: support adding hookin');
  } if (c instanceof hi.AbstractTransfer) {
    if (!c.isAuthorized()) {
      throw 'claimable was not authorized';
    }

    if (c instanceof hi.FeeBump) {
      return sendFeeBump(c);
    } else if (c instanceof hi.Hookout) {
      return sendHookout(c);
    } else if (c instanceof hi.LightningPayment) {
      return sendLightning(c);
    } else {
      throw new Error('unknown abstract transfer');
    }
  }
  else { 
    const _: never = c;
    throw new Error('unknown claimable');
  }
}