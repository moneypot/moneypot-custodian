import { Pool, PoolClient, types } from 'pg';
import http from 'http';
// import crypto from 'crypto';

types.setTypeParser(20, function (val) {
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
    // FOR UPDATE is useless when we do this
    await client.query('LOCK TABLE claimables IN ACCESS EXCLUSIVE MODE');
    await client.query('LOCK TABLE transfer_inputs IN ACCESS EXCLUSIVE MODE');

    await client.query('LOCK TABLE statuses IN ACCESS EXCLUSIVE MODE'); // don't think this one is necessary

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
    return new Promise(async (resolve, reject) => {
      let result: T | undefined | Error;
      const startTime = Date.now();

      // we don't want stuff to get stuck, controversial?
      // if (fixedTime > 2000) {
      //   if (crypto.randomBytes(1).readUInt8(0) % 10 > 5) {
      //     fixedTime = (crypto.randomBytes(1).readUInt8(0) % 10) * 1000; // between 0 and 9000
      //     console.log(`[fixed-time]: updated fixed-time: ${fixedTime} `);
      //   }
      // }
      try {
        result = await f();
      } catch (e) {
        result = new Error(e);
      }
      // hmmm. can this leak anything?
      if (result === undefined) {
        reject(new Error('const timed function: ' + debugName + ' cant return undefined'));
        return;
      }
      const endTime = Date.now();
      const duration = endTime - startTime;

      const newFixedTime = Math.max(duration, fixedTime);

      if (newFixedTime > fixedTime) {
        console.log(
          `constTime'd function ${debugName} taking too long, so bumping maxTime from ${fixedTime} to ${newFixedTime}`
        );
      }
      fixedTime = newFixedTime;

      let retry = -1;
      function afterSleep() {
        if (result instanceof Error) {
          reject(result.message);
          return;
        }
        if (result !== undefined) {
          resolve(result);
          return;
        }

        retry++;
        if (retry === 15) {
          reject(new Error('const time function never '));
          return;
        }
        sleep(2 ** retry).then(afterSleep);
      }

      sleep(fixedTime).then(afterSleep);
    });
  };
}

export function cachedData<T>(debugName: string = 'func', ms: number) {
  let date: number | undefined;
  let data: T | undefined;
  return (f: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (date !== undefined) {
        if (date + ms > Date.now()) {
          if (data) {
            resolve(data);
            return;
          }
        } else if (date + ms <= Date.now()) {
          date = undefined;
        }
      }
      f().then((r) => {
        if (r === undefined) {
          reject(new Error('cached func: ' + debugName + ' cant return undefined'));
          return;
        }
        data = r;
        if (date === undefined) {
          date = Date.now();
        }
        if (data !== undefined) {
          resolve(r);
          return;
        }
      }, reject);
    });
  };
}

export function DataLimiter<T>(debugName: string = 'func', maxCount: number, timeBetween: number) {
  let requests: { [key: string]: number }[] = [];

  return (b: http.IncomingMessage, f: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const ip = b.headers['x-forwarded-for'];
      let count = 0;
      let isAllowed = false;
      const p = requests.reverse();
      for (const l of p) {
        for (const k in l) {
          if (k === (ip instanceof Array ? ip[0] : typeof ip === 'string' ? ip : '127.0.0.1')) {
            count++;
          }
          if (l[k] < Date.now() - timeBetween) {
            p.splice(p.indexOf(l), p.length - 1); // time based.
          }
        }
      }
      requests = p.reverse();

      if (count >= maxCount) {
        isAllowed = false;
      } else {
        if (typeof ip === 'string') {
          requests.push({ [ip]: Date.now() });
        } else if (ip instanceof Array) {
          // (this bad?)
          const p = ip[0];
          requests.push({ [p]: Date.now() });
        }
        isAllowed = true;
      }
      if (!isAllowed) {
        reject(new Error('limiter func: ' + debugName + ' has been triggered on ' + maxCount + ' '));
        return;
      }

      f().then((r) => {
        if (r === undefined) {
          reject(
            new Error('Data limited function (nested in a const time func): ' + debugName + ' cant return undefined')
          );
          return;
        }
        if (r !== undefined) {
          resolve(r);
          return;
        }
      }, reject);
    });
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
