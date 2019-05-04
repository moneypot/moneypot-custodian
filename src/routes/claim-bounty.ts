import * as hi from 'hookedin-lib';

import dbClaim from '../db/claim';

export default async function(body: any): Promise<hi.POD.Acknowledged & hi.POD.ClaimResponse> {
  const claimReq = hi.ClaimBountyRequest.fromPOD(body);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  if (!claimReq.verify()) {
    throw 'CLAIMANT_AUTHORIZATION_FAIL';
  }

  return await dbClaim(claimReq);
}