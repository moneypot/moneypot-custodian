import http from 'http';
import genNonces from './routes/gen-nonces';
import readJson from './util/read-json';
import claimTransferChange from './routes/claim-transfer-change';
import claimHookin from './routes/claim-hookin';
import transferHookout from './routes/transfer-hookout';
import transfer from './routes/transfer';
import coin from './routes/coin';
import changeByClaimant from './routes/change-by-claimant';
import index from './routes/index';
import feeSchedule from './routes/fee-schedule';

async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {
  const url = req.url;
  if (url === undefined) {
    throw new Error('404: missing url');
  }

  switch (url) {
    case '/':
      return index();
    case '/fee-schedule':
      return await feeSchedule();
  }
  if (url.startsWith('/transfers/')) {
    return transfer(url);
  } else if (url.startsWith('/coin/')) {
    return coin(url);
  } else if (url.startsWith('/change/claimants/')) {
    return changeByClaimant(url);
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    switch (url) {
      case '/gen-nonces':
        return await genNonces(body);
      case '/claim-transfer-change':
        return await claimTransferChange(body);
      case '/claim-hookin':
        return await claimHookin(body);
      case '/transfer':
        return await transferHookout(body);
      case '/transfer-feebump':
    }
  }
}

async function constTime<T>(ms: number, f: () => Promise<T>): Promise<T> {
  const startTime = Date.now();
  const result = await f();
  const endTime = Date.now();

  const duration = endTime - startTime;
  let sleep = 0;

  if (duration > ms) {
    console.log("constTime'd function took ", duration, "ms, but should've finished under ", ms);
  } else {
    sleep = ms - duration;
  }
  await new Promise(resolve => setTimeout(resolve, sleep));
  return result;
}

const isProd = process.env.NODE_ENV === 'production';

let reqCounter = 0;

const server = http.createServer(async (req, res) => {
  const start = Date.now();

  const reqCount = ++reqCounter;
  if (!isProd) {
    console.log(`--> ${req.method} ${req.url} req=${reqCount}`);
  }

  let r;
  try {
    const result = await runner(req, res);
    if (result === undefined) {
      res.statusCode = 404;
      r = `"ROUTE_NOT_FOUND"`;
    } else {
      r = JSON.stringify(result);
    }
  } catch (err) {
    if (typeof err === 'string') {
      r = JSON.stringify(err);
      res.statusCode = err === 'RETRY_NONCE' ? 503 : 400;
    } else {
      console.error('caught exception: ', err);
      res.statusCode = 500;
      r = '"internal error"';
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const end = Date.now();

  if (!isProd) {
    console.log(`<-- ${req.method} ${req.url} req=${reqCount} status=${res.statusCode} time=${end - start}ms`);
  }

  res.end(r);
});

let port = 3030;
if (process.env.PORT) {
  port = Number.parseInt(process.env.PORT);
}

server.listen(port, () => {
  console.log(`Server running at ${port} `);
});
