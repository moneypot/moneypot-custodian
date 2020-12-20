import * as child from 'child_process';
import { isProcessRunning } from './program-check';

// TODO make processrunning into variable for stuff like lnd daemon?!
export async function startDaemon(command: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    child.exec(`${command}`, async (err: any, stdout: string, stderr: string) => {
      if (err) reject(err);
      resolve(await isProcessRunning('bitcoind'));
    });
  });
}
