import * as rpcClient from '../util/rpc-client';
import { templateTransactionWeight } from '../config';

export default async function() {
  const consolidationFeeRate = await rpcClient.getConsolidationFeeRate();
  const immediateFeeRate = await rpcClient.getImmediateFeeRate();

  return {
    consolidationFeeRate,
    immediateFeeRate,
    immediate: Math.round(immediateFeeRate * templateTransactionWeight),
    batch: Math.round(immediateFeeRate * 32), // TODO: factor 32 out (it's the size of an output..)
  };
}
