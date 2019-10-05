import { EventEmitter } from 'events';
import * as rpcClient from '../util/rpc-client';

export default class BlockWatcher extends EventEmitter {
  constructor() {
    super();

    // TODO: how to handle errors?
    (async () => {
      let bestBlock = 0;
      while (true) {
        const info = await rpcClient.getBlockChainInfo();
        if (info.blocks > bestBlock) {
          this.emit('NEW_BLOCK');

          bestBlock = info.blocks;
        }
      }
    })();
  }
}
