import * as https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { useTor } from '../config';

const agent = useTor ? new SocksProxyAgent('socks5://127.0.0.1:9050') : undefined;


// copy paste from coinsayer
export function api(h: string, path: string): Promise<any | Error> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: h, 
      path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      agent,
    };

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');

      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error('api error, body: ', body);
          reject(new Error('status not 200'));
          return;
        }

        let obj;
        try {
          obj = JSON.parse(body);
        } catch (err) {
          reject(body);
          return;
        }
        resolve(obj);
      });
    });

    req.on('error', reject);

    //req.write(JSON.stringify(h));
    req.end();
  });
}
