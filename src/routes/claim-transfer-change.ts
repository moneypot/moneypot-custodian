import * as hi from 'hookedin-lib';

import dbClaim from '../db/claim';

import * as lookupTransfer from '../db/lookup-transfer';

export default async function(body: any): Promise<hi.POD.ClaimResponse> {
  const claimReq = hi.ClaimRequest.fromPOD(body);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  const transferHash = claimReq.claimHash;
  const transfer = await lookupTransfer.byHash(transferHash.toPOD());
  if (!transfer) {
    throw 'TRANSFER_NOT_FOUND';
  }

  const claimant = hi.PublicKey.fromPOD(transfer.change.claimant);
  if (claimant instanceof Error) {
    throw claimant;
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, claimant)) {
    throw 'CLAIMANT_AUTHORIZATION_FAIL';
  }

  return await dbClaim(claimReq);
}
