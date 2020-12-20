import * as child from 'child_process';

export async function isProcessRunning(processName: string): Promise<boolean> {
  const cmd = (() => {
    switch (process.platform) {
      case 'win32':
        return `tasklist`;
      case 'darwin':
        return `ps -ax | grep ${processName}`;
      case 'linux':
        return `ps -A`;
      default:
        return 'false'; // will return false
    }
  })();

  return new Promise((resolve, reject) => {
    child.exec(cmd, (err: any, stdout: string, stderr: string) => {
      if (err) reject(err);

      resolve(stdout.toLowerCase().indexOf(processName.toLowerCase()) > -1);
    });
  });
}
