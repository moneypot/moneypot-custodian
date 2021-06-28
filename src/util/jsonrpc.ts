import assert from 'assert';
import http from 'http';
import { decode } from 'punycode';

export default class JSONRpcClient {
  host: string;
  port: number;
  auth: string;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  }

  call(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const [requestJSON, reqId] = buildRequestJSON(method, params);
      var headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestJSON),
        Authorization: this.auth,
      };
      var options = {
        hostname: this.host,
        port: this.port,
        path: '/',
        method: 'POST',
        headers: headers,
      };
      var buf = '';
      var req = http.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk: string) {
          buf += chunk;
        });
        res.on('end', function () {
          if (buf.length === 0) {
            reject(new Error('got no response'));
            return;
          }
          let decoded = JSON.parse(buf);
          if (decoded.id !== reqId) {
            console.error('Expected a response of: ', reqId, ' but got: ', decoded.id);
            reject(new Error('unexpected response id'));
            return;
          }

          if (decoded.error) {
            const error = new Error('rpc error');
            Object.assign(error, { method, params }, decoded.error);

            reject(error);
          } else {
            resolve(decoded.result);
          }
        });
        res.on('error', function (err: any) {
          reject(new Error(err));
        });
      });
      req.on('error', function (err: any) {
        reject(new Error(err));
      });
      req.write(requestJSON);
      req.end();
    });
  }
}

let reqCounter = 1;

function buildRequestJSON(method: string, params: any): [string, number] {
  const reqId = reqCounter++;

  return [
    JSON.stringify({
      jsonrpc: '2.0',
      id: reqId,
      method: method,
      params: params,
    }),
    reqId,
  ];
}
