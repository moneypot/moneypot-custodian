import * as hi from 'moneypot-lib';

if (
  !process.env.CURRENCY ||
  !process.env.CUSTODIAN_SECRET_SEED ||
  !process.env.SECRET_ACK ||
  !process.env.SECRET_FUNDING ||
  !process.env.SECRET_BLINDING ||
  !process.env.WIPEDATE
) {
  throw 'check your parameters!';
}

// more env variables core
if (!process.env.CORE_USER || !process.env.CORE_PASSWORD) {
  throw 'check core params.';
}

// more env variables postgresql
if (!process.env.DATABASE_URL) {
  throw 'check postgresql params';
}

const currency = process.env.CURRENCY || 'tBTC';
const custodianSecretSeed = hi.Buffutils.fromString(process.env.CUSTODIAN_SECRET_SEED);

export const ackSecretKey = computePrivKey(process.env.SECRET_ACK);
export const fundingSecretKey = computePrivKey(process.env.SECRET_FUNDING);
export const blindingSecretKeys: hi.PrivateKey[] = [];

// you can comment this out as it is optional
export const wipeDate = new Date(process.env.WIPEDATE);

for (let i = 0; i <= hi.Magnitude.MaxMagnitude; i++) {
  blindingSecretKeys.push(computePrivKey(`${process.env.SECRET_BLINDING} ${i}`));
}

const custodianInfo = new hi.CustodianInfo(
  ackSecretKey.toPublicKey(),
  currency,
  fundingSecretKey.toPublicKey(),
  blindingSecretKeys.map(bs => bs.toPublicKey()),
  wipeDate.toISOString()
);

export default custodianInfo;

function computePrivKey(prefix: string) {
  const bytes = hi.Hash.fromMessage(prefix, custodianSecretSeed);
  if (bytes instanceof Error) {
    throw bytes;
  }
  const key = hi.PrivateKey.fromBytes(bytes.buffer);
  if (key instanceof Error) {
    throw key;
  }

  return key;
}
