import * as rpcClient from '../util/rpc-client';

// return as an error type, because this goes directly to the client.
export default async function (url: string): Promise<number | Error> {
  const confTarget = Number(url.substring('/fee-rate/'.length));
  if (typeof confTarget != 'number' || isNaN(confTarget)) {
    throw 'Yo skid, whaddya sending me?';
  }

  const fee = await rpcClient.getDynamicFeeRate(confTarget);
  if (typeof fee != 'number') {
    throw `Couldn't fetch feerates!`; // error
  }

  return fee;
}
