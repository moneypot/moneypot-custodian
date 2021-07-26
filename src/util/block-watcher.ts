import { EventEmitter } from 'events';
import * as rpcClient from '../util/rpc-client';
import { isProcessRunning } from './program-check';
import { startDaemon } from './daemon-start';

export default class BlockWatcher extends EventEmitter {
  constructor() {
    super();

    (async () => {
      let bestBlock = 0;
      while (true) {
        let info;
        // continue itself on connection err when we use a try block..? connection err seems to occur randomly once in a while, in that case we should not catch the entire func
        try {
          info = await rpcClient.getBlockChainInfo();
        } catch (error) {
          console.log('[INTERNAL ERROR],', error, 'caught in try')
          continue
        }
        if (info.blocks > bestBlock) {
          this.emit('NEW_BLOCK');
          bestBlock = info.blocks;
        }
      }
    })().catch(async (err) => {
      // TODO: how to handle errors?
      console.error('[INTERNAL_ERROR] block watcher caught an error outside of calling for a block: ', err);
    });
  }
}
