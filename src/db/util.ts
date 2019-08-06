import { Pool, PoolClient, types } from 'pg';
types.setTypeParser(20, function(val) {
  return parseInt(val);
});

let connectionString = 'postgres://localhost:5432/captain-hook';
if (process.env.DATABASE_URL) {
  connectionString = process.env.DATABASE_URL;
}

export const pool = new Pool({
  connectionString,
});

export async function withTransaction<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const r = await f(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    console.error('withTransaction caught: ', e, ' trying to rollback...');
    // TODO: uncomment this after 1855 is merged
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export function constTime<T>(debugName: string = 'func') {
  let fixedTime = 1; // how long to sleep, auto gets bumped as required;

  return (f: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      let result: T | undefined;
      const startTime = Date.now();

      f().then(r => {
        if (r === undefined) {
          reject(new Error('const timed function: ' + debugName + ' cant return undefined'));
          return;
        }
        result = r;
      }, reject);

      let retry = -1;
      function afterSleep() {
        if (result !== undefined) {
          resolve(result);
          return;
        }

        retry++;
        if (retry === 15) {
          reject(new Error('const time function never '));
          return;
        }

        const endTime = Date.now();
        const duration = endTime - startTime;
        const newFixedTime = Math.max(duration + 1, fixedTime + 1);
        console.log(
          `constTime'd function ${debugName} taking too long, so bumping maxTime from ${fixedTime} to ${newFixedTime}`
        );
        fixedTime = newFixedTime;
        sleep(2 ** retry).then(afterSleep);
      }

      sleep(fixedTime).then(afterSleep);
    });
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
