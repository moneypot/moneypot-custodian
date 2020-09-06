export const inputWeight = 68 * 4;
// 1 input, 2 outputs all segwit
export const templateTransactionWeight = 561;
// 1 input 2 outputs, 1 output wrapped
export const wrappedTransactionWeight = 565;
// 1 input 2 outputs 1 output legacy
export const legacyTransactionWeight = 573;

export const legacyOutput = 34 * 4;
export const wrappedOutput = 32 * 4;
export const segwitOutput = 31 * 4;
// check this
export const segmultiOutput = 43 * 4;
export const segmultiTransactionWeight = 609;

export const network: 'testnet' | 'mainnet' = 'testnet';

export const hasCoinsayer: boolean = false;

export const segInput = 67.75 * 4;
export const nestedInput = 75 * 4; // ?
