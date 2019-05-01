import * as hi from 'hookedin-lib';

const currency = process.env.CURRENCY || 'tBTC';

const custodianSecretSeed = hi.Buffutils.fromString(process.env.CUSTODIAN_SECRET_SEED || 'this is not very secret');

const ackSecretKey = computePrivKey('ack secret');
const fundingSecretKey = computePrivKey('funding secret');
const blindingSecretKeys = [];
for (let i = 0; i <= hi.Magnitude.MaxMagnitude; i++) {
  blindingSecretKeys.push(computePrivKey(`blind secret ${i}`));
}

const custodianInfo = new hi.CustodianInfo(
  ackSecretKey.toPublicKey(),
  currency,
  fundingSecretKey.toPublicKey(),
  blindingSecretKeys.map(bs => bs.toPublicKey())
);

const ackCustodianInfo: hi.AcknowledgedCustodianInfo = hi.Acknowledged.acknowledge(custodianInfo, ackSecretKey);
export default ackCustodianInfo;

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
