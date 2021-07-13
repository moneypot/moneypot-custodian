import * as hi from 'moneypot-lib';
import * as rpcClient from '../util/rpc-client';

import { fundingSecretKey } from '../custodian-info';

import { insertStatus } from '../db/status';
import HookinAccepted from 'moneypot-lib/dist/status/hookin-accepted';

import BlockWatcher from './block-watcher';
import { addressType } from './rpc-client';
import { pool } from '../db/util';
import * as config from '../config';

let blockWatcher = new BlockWatcher();

// sometimes not processed upon new block? only encountered this error once so far?! need to investigate function further

export default async function processHookin(hookin: hi.Hookin) {
  await importHookin(hookin);

  let check = async () => {
    const txid = hi.Buffutils.toHex(hookin.txid);
    console.log('Checking hookin: ', txid, ':', hookin.vout);
    let txinfo = await rpcClient.getTxOut(txid, hookin.vout);

    // okay, it could be that it was sent to an address which has been used previously, and so we might've already used the input.
    // ok, the input has already been accepted, so we only need to make sure it actually exists somewhere. (not double-spent)
    if (!txinfo) {
      const rawtransaction = await rpcClient.getRawTransaction(txid, undefined, true);
      if (typeof rawtransaction === 'string' || rawtransaction instanceof Error) {
        console.log('[warn] could not find txout for ', txid, ':', hookin.vout, ' .. so ignoring');
        return; // does not exist anymore, possible doublespend or whatever.
      }
      if (rawtransaction) {
        for (const i of rawtransaction.vout) {
          // really, the only thing we need to check is if it exists, and has confirmations, but i guess this doesn't hurt.
          if (i.n === hookin.vout) {
            // this is unnecessary
            const p = Math.round(i.value * 1e8);
            if (p === hookin.amount) {
              txinfo = {
                bestBlock: '',
                confirmations: rawtransaction.confirmations,
                amount: p,
                address: i.scriptPubKey.addresses.length === 1 ? i.scriptPubKey.addresses[0] : null,
              };
            }
          }
        }
      }
      if (!txinfo) {
        console.log('[warn] could not find txout for ', txid, ':', hookin.vout, ' .. so ignoring');
        return;
      }
    }

    // TODO: handle not found..

    // TODO: process.env dust fees?

    // TODO: add p2tr deposit

    if (txinfo.amount >= 1e8) {
      if (txinfo.confirmations >= 6) {
        const getFee = async (txinfo: any) => {
          return txinfo.address === null ? 500 : addressType(txinfo.address) === 'p2wpkh' ? 100 : 500;
        };
        // const consolidationFee = 100; // todo: something saner
        await insertStatus(new HookinAccepted(hookin.hash(), await getFee(txinfo)));
        return;
      }
    }
    // (1e6 < txinfo.amount && txinfo.amount < 1e8)
    if (1e6 < txinfo.amount && txinfo.amount < 1e8) {
      if (txinfo.confirmations >= 1) {
        const getFee = async (txinfo: any) => {
          // ?
          return txinfo.address === null ? 5000 : addressType(txinfo.address) === 'p2wpkh' ? 1000 : 5000;
        };
        await insertStatus(new HookinAccepted(hookin.hash(), await getFee(txinfo)));
        return;
      }
    }

    // zero-conf up to 0.01 btc, - no RBF, estimate fee > 3 blocks. // TODO: this is disabled for now. Code not pushed.
    if (1e6 >= txinfo.amount) {
      let confirmations = 1;
      const getFee = (txinfo: any) => {
        return txinfo.address === null ? 5000 : addressType(txinfo.address) === 'p2wpkh' ? 1000 : 5000;
      };

      if (txinfo.confirmations >= confirmations) {
        // should be confirmations
        await insertStatus(new HookinAccepted(hookin.hash(), await getFee(txinfo)));
        return;
      }
    }
    // still waiting, check again after a block
    blockWatcher.once('NEW_BLOCK', check);
  };

  check();
}

async function importHookin(hookin: hi.Hookin) {
  const spendingPrivkey = fundingSecretKey.tweak(hookin.getTweak()).toWif(config.bNetwork);

  await rpcClient.importPrivateKey(spendingPrivkey);
  await rpcClient.importPrunedFunds(hookin.txid, hookin.vout);
}
