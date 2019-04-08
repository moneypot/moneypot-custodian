import * as hi from 'hookedin-lib';
import * as lookupTransfer from '../db/lookup-transfer';

export default async function(url: string) {
  const input = url.substring('/transfers/'.length);

  const hash = hi.Hash.fromBech(input);
  if (hash instanceof Error) {
    throw 'INVALID_HASH';
  }

  return await lookupTransfer.byHash(input);
}
