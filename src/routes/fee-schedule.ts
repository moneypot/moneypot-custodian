import * as rpcClient from '../util/rpc-client';
import * as config from '../config';

type feeInterface = {
  consolidationFeeRate: number;
  immediateFeeRate: number;
  immediate: number;
  batch: number;
};

// return as an error type, because this goes directly to the client.
export default async function (): Promise<feeInterface | Error> {
  const consolidationFeeRate = await rpcClient.getConsolidationFeeRate();
  const immediateFeeRate = await rpcClient.getImmediateFeeRate();
  if (typeof consolidationFeeRate != 'number' || typeof immediateFeeRate != 'number') {
    throw `Couldn't fetch feerates!`; // error
  }

  return {
    consolidationFeeRate,
    immediateFeeRate,
    immediate: Math.ceil(immediateFeeRate * config.p2wpkhTransactionWeight), // 140.25 != 141 ... // remove immediate and batch no longer needed
    batch: Math.round(immediateFeeRate * 32), // TODO: factor 32 out (it's the size of an output..)
  };
}
