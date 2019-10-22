import { EventEmitter } from 'events';
import * as rpcClient from '../util/rpc-client';

export default class BlockWatcher extends EventEmitter {
  constructor() {
    super();

    (async () => {
      let bestBlock = 0;
      while (true) {
        const info = await rpcClient.getBlockChainInfo();
        if (info.blocks > bestBlock) {
          this.emit('NEW_BLOCK');

          bestBlock = info.blocks;
        }
      }
    })().catch(err => {
      // TODO: how to handle errors?
      console.error('[INTERNAL_ERROR] block watcher caught an error: ', err);
    });
  }
}
