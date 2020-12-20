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
        const info = await rpcClient.getBlockChainInfo();
        if (info.blocks > bestBlock) {
          this.emit('NEW_BLOCK');
          bestBlock = info.blocks;
        }
      }
    })().catch(async err => {
      // TODO: how to handle errors?
      console.error('[INTERNAL_ERROR] block watcher caught an error: ', err);

      // TODO: do these get garbage collected or is this causing a memory leak? TODO.
      const isRunning = await isProcessRunning('bitcoind');
      if (!isRunning) {
        let i: boolean;
        try {
          i = await startDaemon('bitcoind // MORE COMMANDS HERE if bitcoin conf is not set. // ');
        } catch (e) {
          i = false;
        }
        if (i) {
          new BlockWatcher();
        } else {
          console.error('[INTERNAL_ERROR] [MANUAL INTERVENTION NEEEDED] Err: Cannot start bitcoind');
        }
      } else if (isRunning) {
        // might still be loading in, restart blockwatcher.
        setTimeout(() => {
          new BlockWatcher();
        }, 60000);
      }
    });
  }
}
