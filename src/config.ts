export const network: 'testnet' | 'mainnet' = process.env.CURRENCY === 'tBTC' ? 'testnet' : 'mainnet';

export const lnNetwork: 'testnet' | 'bitcoin' = process.env.CURRENCY === 'tBTC' ? 'testnet' : 'bitcoin';
export const bNetwork: boolean = process.env.CURRENCY === 'tBTC' ? true : false;

export const hasCoinsayer: boolean = process.env.COINSAYER === 'false' ? false : true; // assume true
// export const has0conf: boolean = false; // only enable if you know what you're doing
// export const BlockCyperApiToken = 'AnyTokenHere';

// All inputs are assumed native.
export const inputWeight = 68 * 4;
// 1 input, 2 outputs all segwit
export const templateTransactionWeight = 561;
// 1 input 2 outputs, 1 output wrapped
export const wrappedTransactionWeight = 565;
// 1 input 2 outputs 1 output legacy
export const legacyTransactionWeight = 573;
// 1 input 2 outputs 1 output multisig native segwit
export const segmultiTransactionWeight = 609;

// individual outputs
export const legacyOutput = 34 * 4;
export const wrappedOutput = 32 * 4;
export const segwitOutput = 31 * 4;
export const segmultiOutput = 43 * 4;
