import * as hi from 'hookedin-lib';
import lookupTransactionInput from '../db/lookup-spent-coin';

export default async function(url: string) {
  const owner = url.substring('/spent-coin/'.length);

  const o = hi.PublicKey.fromBech(owner);
  if (o instanceof Error) {
    throw 'INVALID_OWNER';
  }

  return await lookupTransactionInput(owner);
}
