import * as hi from 'hookedin-lib';

import * as dbTransfer from '../../db/transfer';
import { withTransaction } from '../../db/util';

export default async function(body: any): Promise<string> {
  // TODO: should validate inputs/outputs
  const transfer = hi.TransferBounty.fromPOD(body);
  if (transfer instanceof Error) {
    throw transfer;
  }

  const ackTransfer: hi.AcknowledgedTransfer = hi.Acknowledged.acknowledge(
    transfer.prune(),
    hi.Params.acknowledgementPrivateKey
  );

  await withTransaction(async dbClient => {
    const insertRes = await dbTransfer.insertTransfer(dbClient, ackTransfer);
    if (!insertRes) {
      // already exists, so just return the ack...
      return;
    }

    await dbTransfer.insertBounty(dbClient, transfer.output);
  });

  return ackTransfer.acknowledgement.toBech();
}
