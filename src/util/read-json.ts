import http from 'http';

// TODO: handle max size..
export default function (req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      let json;
      try {
        json = JSON.parse(body);
      } catch (err) {
        console.error('Caught: ', err, ' when trying to parse ', body);
        reject(err);
      }

      resolve(json);
    });

    req.on('error', reject);
  });
}
