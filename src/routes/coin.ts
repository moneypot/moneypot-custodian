import * as hi from 'hookedin-lib';
import lookupCoin from '../db/lookup-coin';

export default async function(url: string) {
  const owner = url.substring('/coin/'.length);

  const o = hi.PublicKey.fromBech(owner);
  if (o instanceof Error) {
    throw 'INVALID_OWNER';
  }

  return await lookupCoin(owner);
}
