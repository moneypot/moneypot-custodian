import * as https from 'https';

export interface Problem {
  minFeeRate: number;
  consolidationFeeRate: number;
  fixedWeight: number;
  changeWeight: number;
  changeSpendWeight: number;
  minAbsoluteFee: number;
  maxInputsToSelect: number;
  minChangeAmount: number;
  timeout: number; // seconds
  mandatoryInputConflicts: Array<Array<string>>;
  inputs: { identifier: string, weight: number, amount: number}[];
  outputs: { identifier: string, weight: number, amount: number, requirement: string }[]
}

export interface Selection {
  inputs: string[];
  outputs: string[];
  changeAmount: number;
  optimal: boolean;
  weight: number;
  miningFee: number;
  miningSacrifice: number;
}

export function req(p: Problem): Promise<Selection> {

  return new Promise((resolve, reject) => {

    const options = {
      hostname: 'freeapi.coinsayer.com',
      path: '/v1/solve-problem',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  
    const req = https.request(options, res => {

      res.setEncoding('utf8');

      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error('coinsayer error, body: ', body);
          reject(new Error('status not 200'));
          return;
        }

        let obj;
        try {
          obj = JSON.parse(body);
        } catch (err) {
          console.error('could not parse coinsayer: ', body);
          reject(new Error('coulnt parse api response'));
          return;
        }

        resolve(obj);

      });  
    });

    req.on('error', reject);


    req.write(JSON.stringify(p));
    req.end();
  })



}


