import * as assert from 'assert';
import * as hi from 'hookedin-lib';

import sendFeeBump from './send-feebump';
import sendHookout from './send-hookout';
import sendLightning from './send-lightning';
import addHookin from './add-hookin';
import { pool } from '../db/util';

export default async function addClaimable(body: any): Promise<hi.POD.Claimable & hi.POD.Acknowledged> {
  const claimable = hi.claimableFromPOD(body);
  if (claimable instanceof Error) {
    console.warn('could not parse claimable, got: ', claimable);
    throw 'could not parse claimable';
  }

  // quick precheck
  const searchRes = await pool.query(`SELECT claimable FROM claimables WHERE claimable->>'hash' = $1`, [
    claimable.hash().toPOD(),
  ]);
  if (searchRes.rows.length !== 0) {
    assert.equal(searchRes.rows.length, 1);
    return searchRes.rows[0].claimable as hi.POD.Claimable & hi.POD.Acknowledged;
  }

  if (claimable instanceof hi.LightningInvoice) {
    throw 'cant add a lightinginvoice, gen one instead';
  } else if (claimable instanceof hi.Hookin) {
    return addHookin(claimable);
  }
  if (claimable instanceof hi.AbstractTransfer) {
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
  } else {
    const _: never = claimable;
    throw new Error('unknown claimable');
  }
}
