import * as hi from 'hookedin-lib';
import * as rpcClient from '../util/rpc-client';

import dbClaim from '../db/claim';
import { pool } from '../db/util';

// body should be { hookin, claimRequest }
// returns an acknowledgement
export default async function(body: any): Promise<hi.POD.ClaimResponse> {
  if (typeof body !== 'object') {
    throw 'CLAIM_HOOKIN_EXPECTED_OJBECT';
  }

  const hookin = hi.Hookin.fromPOD(body.hookin);
  if (hookin instanceof Error) {
    throw hookin;
  }

  const txOut = await rpcClient.getTxOut(hookin.txid, hookin.vout);

  const expectedAddress = hi.Params.fundingPublicKey.tweak(hookin.getTweak().toPublicKey()).toBitcoinAddress(true);
  if (expectedAddress !== txOut.address) {
    console.warn('Expected address: ', expectedAddress, ' got address: ', txOut.address);
    throw 'INVALID_HOOKIN';
  }

  // TODO: require a certain amount of confs..
  // const { confirmations } = txOut.result;

  const claimReq = hi.ClaimRequest.fromPOD(body.claimRequest);
  if (claimReq instanceof Error) {
    throw claimReq;
  }

  if (!claimReq.authorization.verify(claimReq.hash().buffer, hookin.claimant)) {
    throw 'CLAIMANT_AUTHORIZATION_FAIL';
  }

  const ackResponse = await dbClaim(claimReq);

  // import in the background...
  importHookin(hookin);

  return ackResponse;
}

async function importHookin(hookin: hi.Hookin) {
  const basePrivkey = hi.Params.fundingPrivateKey;

  const spendingPrivkey = basePrivkey.tweak(hookin.getTweak()).toWif();

  try {
    await rpcClient.importPrivateKey(spendingPrivkey);
    await rpcClient.importPrunedFunds(hookin.txid);
    await pool.query(`UPDATE hookins SET imported = true WHERE hash = $1`, [hookin.hash().toPOD()]);
  } catch (err) {
    console.error('could not import funds!', err);
  }
}
