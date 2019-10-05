import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import { fundingSecretKey } from '../custodian-info';

import { insertStatus } from '../db/status';
import HookinAccepted from 'hookedin-lib/dist/status/hookin-accepted';

import BlockWatcher from './block-watcher';

let blockWatcher = new BlockWatcher();

export default async function processHookin(hookin: hi.Hookin) {
  await importHookin(hookin);

  let check = async () => {
    console.log('Checking hookin: ', hi.Buffutils.toHex(hookin.txid), ':', hookin.vout);

    const txinfo = await rpcClient.smartGetTxOut(hi.Buffutils.toHex(hookin.txid), hookin.vout);
    // TODO: handle not found..

    if (txinfo.confirmations > 3) {
      const consolidationFee = 100; // todo: something saner
      await insertStatus(new HookinAccepted(hookin.hash(), consolidationFee));
      return;
    }

    // still waiting, check again after a block
    blockWatcher.once('NEW_BLOCK', check);
  };

  check();
}

async function importHookin(hookin: hi.Hookin) {
  const spendingPrivkey = fundingSecretKey.tweak(hookin.getTweak()).toWif();

  await rpcClient.importPrivateKey(spendingPrivkey);
  await rpcClient.importPrunedFunds(hookin.txid);
}
