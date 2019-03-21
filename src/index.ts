import http from 'http';
import genNonces from './routes/gen-nonces';
import readJson from './util/read-json';
import claimBounty from './routes/claim-bounty';
import claimHookin from './routes/claim-hookin';
//import spentCoin from './routes/spent-coin';
import transferBounty from './routes/transfer/bounty';
import transferHookout from './routes/transfer/hookout';
import transferHookin from './routes/claim-hookin';
//import transferByInput from './routes/transfer-by-input';

async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {
  const url = req.url;
  if (url === undefined) {
    throw new Error('404: missing url');
  }

  // if (url.startsWith('/transfer-by-input/')) {
  //   return transferByInput(url);
  // } else if (url.startsWith('/spent-coin/')) {
  //   return spentCoin(url);
  // }

  if (req.method === 'POST') {
    const body = await readJson(req);
    switch (url) {
      case '/gen-nonces':
        return await genNonces(body);
      case '/claim-bounty':
        return await claimBounty(body);
      case '/claim-hookin':
        return await claimHookin(body);
      case '/transfer-bounty':
        return await transferBounty(body);
      case '/transfer-hookout':
        return await transferHookout(body);
      case '/transfer-hookin':
        return await transferHookin(body);
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

let reqCounter = 0;

const server = http.createServer(async (req, res) => {
  const start = Date.now();

  const reqCount = ++reqCounter;
  console.log(`--> ${req.method} ${req.url} req=${reqCount}`);

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

  console.log(`<-- ${req.method} ${req.url} req=${reqCount} status=${res.statusCode} time=${end - start}ms`);

  res.end(r);
});

let port = 3030;
if (process.env.PORT) {
  port = Number.parseInt(process.env.PORT);
}

server.listen(port, () => {
  console.log(`Server running at ${port} `);
});
