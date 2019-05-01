import crypto from 'crypto';
import * as hi from 'hookedin-lib';

// TODO: store nocnces in db..

const nonceDuration = 60 * 1000; // 1 minute

const nonceMap = new Map<string, hi.PrivateKey>();

export function gen(count: number): ReadonlyArray<string> {
  const pubkeys: string[] = [];

  for (let i = 0; i < count; i++) {
    const privNonce = hi.PrivateKey.fromRand();
    const pubkey = privNonce.toPublicKey().toPOD();

    nonceMap.set(pubkey, privNonce);

    pubkeys.push(pubkey);
  }

  setTimeout(() => {
    for (const pubkey of pubkeys) {
      nonceMap.delete(pubkey);
    }
  }, nonceDuration);

  return pubkeys;
}

// There's a 50% chance this function throws "RETRY_NONCE" to prevent a wagner attack

export function pull(pubkeys: string[]): hi.PrivateKey[] {
  const privkeys = [];
  for (const pubkey of pubkeys) {
    const privkey = nonceMap.get(pubkey);
    if (!privkey) {
      throw 'COULD_NOT_FIND_NONCE';
    }
    nonceMap.delete(pubkey);
    privkeys.push(privkey);
  }

  // Give a 50% chance of just failing this request...
  if (crypto.randomBytes(1).readUInt8(0) % 2 === 0) {
    throw 'RETRY_NONCE'; // lolz sorry! Try again!
  }

  return privkeys;
}
