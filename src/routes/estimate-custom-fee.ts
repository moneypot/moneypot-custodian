import * as rpcClient from '../util/rpc-client';

export interface BitcoinFees {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
}

export default async function getEstimateCustomFee(): Promise<BitcoinFees | Error> {
  const fastestFee = await rpcClient.getDynamicFeeRate(1);
  const halfHourFee = await rpcClient.getDynamicFeeRate(3);
  const hourFee = await rpcClient.getDynamicFeeRate(6);
  // TODO: do something with specific errors
  if (typeof fastestFee != 'number' || typeof halfHourFee != 'number' || typeof hourFee != 'number') {
    throw `one or more feerates failed to fetch`;
  }

  return {
    fastestFee: fastestFee * 4,
    halfHourFee: halfHourFee * 4,
    hourFee: hourFee * 4,
  };
}
