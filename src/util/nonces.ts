import crypto from 'crypto';
import * as hi from 'moneypot-lib';
import { pool } from '../db/util';

// TODO: store nocnces in db..
// RE: I guess this works?
const nonceDuration = 60 * 1000; // 1 minute

const nonceMap = new Map<string, hi.PrivateKey>();

export async function gen(count: number): Promise<ReadonlyArray<string>> {
  const pubkeys: string[] = [];
  const privkeys: string[] = [];

  for (let i = 0; i < count; i++) {
    const privNonce = hi.PrivateKey.fromRand();
    const privkey = privNonce.toPOD();
    const pubkey = privNonce.toPublicKey().toPOD();
    nonceMap.set(pubkey, privNonce);
    pubkeys.push(pubkey);
    privkeys.push(privkey);
  }
  setTimeout(() => {
    for (const pubkey of pubkeys) {
      nonceMap.delete(pubkey);
    }
  }, nonceDuration);
  // We also store rejected nonces.
  try {
    await pool.query(
      `INSERT INTO nonces(nonce, privkey) VALUES($1, $2)
   `,
      [pubkeys, privkeys]
    );
  } catch (err) {
    console.error('could not run query: ', err);
  }
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
