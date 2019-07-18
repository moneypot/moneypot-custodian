import * as rpcClient from '../util/rpc-client';

export default async function() {
  const consolidationFeeRate = await rpcClient.getConsolidationFeeRate();
  const immediateFeeRate = await rpcClient.getImmediateFeeRate();

  return {
    consolidationFeeRate,
    immediateFeeRate,
  };
}
