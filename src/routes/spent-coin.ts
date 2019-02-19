import * as hi from 'hookedin-lib';
import lookupTransactionInput from '../db/lookup-spent-coin';

export default async function(url: string) {
  const owner = url.substring('/spent-coin/'.length);

  try {
    hi.PublicKey.fromBech(owner);
  } catch (err) {
    throw 'INVALID_OWNER';
  }

  return await lookupTransactionInput(owner);
}
