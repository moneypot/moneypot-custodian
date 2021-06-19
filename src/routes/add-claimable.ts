import * as assert from 'assert';
import * as hi from 'moneypot-lib';

import sendFeeBump from './send-feebump';
import sendHookout from './send-hookout';
import sendLightning from './send-lightning';
import addHookin from './add-hookin';
import { pool, poolQuery } from '../db/util';

export default async function addClaimable(body: any): Promise<hi.POD.Claimable & hi.POD.Acknowledged> {
  const claimable = hi.claimableFromPOD(body);
  if (claimable instanceof Error) {
    console.warn('could not parse claimable, got: ', claimable);
    throw 'could not parse claimable';
  }
  // quick precheck

  const searchRes = await poolQuery(`SELECT claimable, created FROM claimables WHERE claimable->>'hash' = $1`, [claimable.hash().toPOD()], claimable.toPOD(), "Adding claimable precheck" )

  // const searchRes = await pool.query(`SELECT claimable, created FROM claimables WHERE claimable->>'hash' = $1`, [
  //   claimable.hash().toPOD(),
  // ]);

  // We return, even if the claimable is possibly not finalized. this would be an error and the client calling to refresh or w/e should not be any sort of practice anyway.
  if (searchRes.rows.length !== 0) {
    assert.equal(searchRes.rows.length, 1);
    let c = searchRes.rows[0].claimable as hi.POD.Claimable & hi.POD.Acknowledged;
    c.initCreated = Math.round(searchRes.rows[0].created / 60000) * 60000; // sanitize creation time to preven time leak
    return c;
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
