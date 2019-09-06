import * as hi from 'hookedin-lib';

import sendFeeBump from './send-feebump';
import sendHookout from './send-hookout';
import sendLightning from './send-lightning';
import addHookin from './add-hookin';


export default async function addClaimable(body: any): Promise<hi.POD.Claimable & hi.POD.Acknowledged> {
  const claimable = hi.claimableFromPOD(body);
  if (claimable instanceof Error) {
    throw 'could not parse claimable';
  }

  if (claimable instanceof hi.LightningInvoice) {
    throw 'cant add a lightinginvoice, gen one instead';
  } else if (claimable instanceof hi.Hookin) {
    return addHookin(claimable);
  } if (claimable instanceof hi.AbstractTransfer) {
    if (!claimable.isAuthorized()) {
      throw 'claimable was not authorized';
    }

    if (claimable instanceof hi.FeeBump) {
      return sendFeeBump(claimable);
    } else if (claimable instanceof hi.Hookout) {
      return sendHookout(claimable);
    } else if (claimable instanceof hi.LightningPayment) {
      return sendLightning(claimable);
    } else {
      throw new Error('unknown abstract transfer');
    }
  }
  else { 
    const _: never = claimable;
    throw new Error('unknown claimable');
  }
}