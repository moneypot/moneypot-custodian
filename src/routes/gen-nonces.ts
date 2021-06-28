import * as nonces from '../util/nonces';

export default async function (n: any) {
  if (typeof n !== 'number') {
    throw 'expected an int for a body';
  }
  if (!Number.isSafeInteger(n) || n <= 0 || n > 255) {
    throw 'can only request between 1 and 255 nonces';
  }

  return nonces.gen(n);
}
