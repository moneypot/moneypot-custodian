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

  if (transfer.change.amount !== claimReq.amount()) {
    console.warn('tried to claim: ', claimReq.amount(), ' but should have claimed: ', transfer.change.amount);
    throw 'WRONG_CLAIM_AMOUNT';
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, claimant)) {
    throw 'AUTHORIZATION_FAIL';
  }

  return await dbClaim(claimReq);
}
