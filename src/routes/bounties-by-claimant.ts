import * as hi from 'hookedin-lib'
import lookupBountiesByClaimant from '../db/lookup-bounties-by-claimant';


export default async function(url: string) {
  const claimant = url.substring('/bounties/claimants/'.length);

  if (hi.PublicKey.fromBech(claimant) instanceof Error) {
    throw 'INVALID_CLAIMANT';
  }


  return await lookupBountiesByClaimant(claimant);
}