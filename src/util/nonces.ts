import crypto from 'crypto';
import * as hi from 'hookedin-lib';

const nonceDuration = 120 * 1000; // 2 minutes in ms

const nonceMap = new Map<string, hi.PrivateKey>();

// returns pubkey as string!
export function gen() {
  const privNonce = hi.PrivateKey.fromRand();
  const pubkey = privNonce.toPublicKey().toBech();

  nonceMap.set(pubkey, privNonce);

  setTimeout(() => {
    nonceMap.delete(pubkey);
  }, nonceDuration);

  return pubkey;
};

// returns undefined if doesn't get the nonce, otherwise a PrivateKey
export function pull(pubkey: string) {

  const privKey = nonceMap.get(pubkey);
  if (!privKey) {
    return undefined;
  }
  nonceMap.delete(pubkey);

  // Give a 50% chance of just failing this request...
  if (crypto.randomBytes(1).readUInt8(0) % 2 === 0) {
    return undefined; // lolz sorry! Try again!
  }

  return privKey;
};
