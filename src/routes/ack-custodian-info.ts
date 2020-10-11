import * as hi from 'moneypot-lib';
import custodianInfo, { ackSecretKey } from '../custodian-info';

export default async function ackCustodianInfo(url: string): Promise<hi.POD.Signature> {
  const message = url.substring('/ack-custodian-info/'.length).split('/');

  // split hash and public key.
  const receivedHash = hi.Hash.fromPOD(message[0]);
  if (receivedHash instanceof Error) {
    return 'SUPPLIED WITH INVALID HASH!';
  }
  const pubkey = hi.PublicKey.fromPOD(message[1]);
  if (pubkey instanceof Error) {
    return 'SUPPLIED WITH INVALID PUBKEY';
  }
  if (custodianInfo.hash().toPOD() != receivedHash.toPOD()) {
    return 'SUPPLIED WITH WRONG HASH!';
  }
  const sigK = hi.Signature.compute(
    hi.Hash.fromMessage('verify', receivedHash.buffer, pubkey.buffer).buffer,
    ackSecretKey
  );

  return sigK.toPOD();
}
