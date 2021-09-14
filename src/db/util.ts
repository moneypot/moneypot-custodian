import { Pool, PoolClient, types } from 'pg';
import http from 'http';
// import crypto from 'crypto';
import { api } from '../util/api-request';

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
    // FOR UPDATE is useless when we do this, also we really only need to lock one table logically but might change table locks to specific txs in the future.
    await client.query('LOCK TABLE claimables IN ACCESS EXCLUSIVE MODE');

    // not necessary
    await client.query('LOCK TABLE transfer_inputs IN ACCESS EXCLUSIVE MODE');
    await client.query('LOCK TABLE statuses IN ACCESS EXCLUSIVE MODE');

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

type P = {Address: string, Fingerprint: string}[]

let ips: undefined | P; 
if (!ips) { 
  api("check.torproject.org", "/api/bulk?ip=1.1.1.1").then(d => ips = d)

  setInterval(async () => {
    ips = await api("check.torproject.org", "/api/bulk?ip=1.1.1.1")
    }, 6000 * 60);
  }


export function ipCheckConst(req: http.IncomingMessage)  {
  if (!ips) { 
    throw "error: couldn't get ips"
  }

  // forwarded by CL. (else rewrite the header)
  const cl = req.headers['x-forwarded-for']
  const clIP = cl instanceof Array ? cl[0] : typeof cl === 'string' ? cl : '127.0.0.1'
      

  for (let i = 0; i < ips.length; i++) {
    const element = ips[i];
    if (element.Address === clIP)
     { 
       return true
     }
  }
  return false

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


// not sure how exploitable this is, force x-forwarded-for to be true?
// TODO, think it should work fine by taking the first if array 
// If an X-Forwarded-For header was already present in the request to Cloudflare, Cloudflare appends the IP address of the HTTP proxy to the header:

// Example: X-Forwarded-For: 203.0.113.1,198.51.100.101,198.51.100.102 
// In the examples above, 203.0.113.1 is the original visitor IP address and 198.51.100.101 and 198.51.100.102 are proxy server IP addresses provided to Cloudflare via the X-Forwarded-For header.

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
