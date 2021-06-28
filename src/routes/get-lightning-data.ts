import * as lightning from '../lightning';

interface LND {
  local_balance: number;
  remote_balance: number;
  capacity: number;
  highest_inbound: number;
  highest_outbound: number;
  identity_pubkey: string;
  num_channels: number;
}

let identity_pubkey: string | undefined = undefined;

export async function getLightningData(): Promise<Error | LND> {
  const channels = await lightning.getListedChannels();

  if (!identity_pubkey) {
    identity_pubkey = (await lightning.getLightningNodeInfo()).node.pub_key;
  }

  let balances = [];
  for (const balance of channels.channels) {
    balances.push({
      local_balance: balance.local_balance,
      remote_balance: balance.remote_balance,
      capacity: balance.capacity,
    });
  }
  const highest_inbound = Math.max(
    ...balances.map((o) => {
      return o.remote_balance;
    })
  );
  const highest_outbound = Math.max(
    ...balances.map((o) => {
      return o.local_balance;
    })
  );

  const b = balances.reduce((acc: { [x: string]: any }, obj: { [x: string]: any }) => {
    for (let key in obj) {
      let a = acc[key] || 0;
      let b = obj[key];
      acc[key] = a + b;
    }
    return acc;
  }, {});

  return {
    ...b,
    highest_inbound,
    highest_outbound,
    identity_pubkey,
    num_channels: channels.channels.length,
  } as LND;
}
