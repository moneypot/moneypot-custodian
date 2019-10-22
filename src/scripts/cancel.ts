import * as lightning from '../lightning';

async function run() {
  console.log('trying to cancel');
  const r = await lightning.cancelInvoice('de55b21d275546fc01fc2db39fb43cfe4b6c123d718e1444066fa4c7c55b45e6');
  console.log('got: ', r);
}

run();
