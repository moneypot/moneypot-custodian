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
}

// There's a 50% chance this function throws "RETRY_NONCE" to prevent a wagner attack
export function pull(pubkey: string) {
  const privKey = nonceMap.get(pubkey);
  if (!privKey) {
    return undefined;
  }
  nonceMap.delete(pubkey);

  // Give a 50% chance of just failing this request...
  if (crypto.randomBytes(1).readUInt8(0) % 2 === 0) {
    throw 'RETRY_NONCE'; // lolz sorry! Try again!
  }

  return privKey;
}
