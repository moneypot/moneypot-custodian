import * as hi from 'hookedin-lib';

import ci from '../custodian-info'

import lookupBountiesByClaimant from '../db/lookup-bounties-by-claimant';


const expectedCustodianPrefix = ci.contents.prefix();

export default async function(url: string) {
  const claimant = url.substring('/bounties/claimants/'.length);

  const address = hi.Address.fromPOD(claimant);
  if (address instanceof Error) {
    console.error('ic: ', address);
    throw 'INVALID_CLAIMANT';
  }

  if (address.custodianPrefix !== expectedCustodianPrefix) {
    throw 'WRONG_CUSTODIAN';
  }


  return await lookupBountiesByClaimant(claimant);
}
