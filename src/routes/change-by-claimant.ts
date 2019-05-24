import * as hi from 'hookedin-lib';

import lookupChangeByClaimant from '../db/lookup-change-by-claimant';


export default async function(url: string) {
  const claimant = url.substring('/change/claimants/'.length);

  const address = hi.Change.fromPOD(claimant);
  if (address instanceof Error) {
    throw 'INVALID_CLAIMANT';
  }


  return await lookupChangeByClaimant(claimant);
}
