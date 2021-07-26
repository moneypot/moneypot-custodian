import http from 'http';

import routes from './routes';
import processInboundLightning from './process-inbound-lightning';
import finalizeHookins from './scripts/finalize-hookins';
import finalizeLightningPayments from './scripts/finalize-lightning';

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
    const result = await routes(req, res);
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
    console.log(`<-- ${req.method} ${req.url} req=${reqCount} status=${res.statusCode} time=${end - start}ms date="${new Date().toISOString()}"`);
  }

  res.end(r);
});

let port = 3030;
if (process.env.PORT) {
  port = Number.parseInt(process.env.PORT);
}

// finalize hookins on startup.
finalizeHookins().catch((err) => {
  console.error('INTERNAL_ERROR caught process Finalizing hookins error: ', err);
});

processInboundLightning().catch((err) => {
  console.error('INTERNAL_ERROR caught process inbound lightning error: ', err);
});

// Finalize lightning payments (only after crashing!)
finalizeLightningPayments().catch((err) => {
  console.error('INTERNAL_ERROR caught process Finalizing hookins error: ', err);
});

server.listen(port, () => {
  console.log(`Server running at ${port} `);
});
