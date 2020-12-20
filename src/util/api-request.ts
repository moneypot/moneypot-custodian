import https from 'https';
// import { BlockCyperApiToken } from '../config';

interface TXQuery {
  age_millis: number;
  receive_count: number;
  confidence: number;
  txhash: string;
  txurl: string;
}
let BlockCyperApiToken = '';

// `https://api.blockcypher.com/v1/btc/test3?token=${BlockToken}/txs/${txid}/confidence`

export function getApi(type?: string, value?: string, command?: string): Promise<TXQuery | Error> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      `https://api.blockcypher.com/v1/btc/test3?token=${BlockCyperApiToken}/${type}}/${value}/${command}`,
      {},
      response => {
        if (response.statusCode) {
          if (response.statusCode < 200 || response.statusCode > 299) {
            reject(new Error('Failed to load page' + response.statusCode));
          }
        }
        let d = '';
        response.on('data', c => (d += c));
        response.on('end', () => resolve(JSON.parse(d)));
      }
    );
    request.on('error', err => reject(err.message));
  });
}
