"use strict";
exports.__esModule = true;
var crypto_1 = require("crypto");
var hi = require("hookedin-lib");
var nonceDuration = 120 * 1000; // 2 minutes in ms
var nonceMap = new Map();
// returns pubkey as string!
function gen() {
    var privNonce = hi.PrivateKey.fromRand();
    var pubkey = privNonce.toPublicKey().toBech();
    nonceMap.set(pubkey, privNonce);
    setTimeout(function () {
        nonceMap["delete"](pubkey);
    }, nonceDuration);
    return pubkey;
}
exports.gen = gen;
;
// returns undefined if doesn't get the nonce, otherwise a PrivateKey
function pull(pubkey) {
    var privKey = nonceMap.get(pubkey);
    if (!privKey) {
        return undefined;
    }
    nonceMap["delete"](pubkey);
    // Give a 50% chance of just failing this request...
    if (crypto_1["default"].randomBytes(1).readUInt8(0) % 2 === 0) {
        return undefined; // lolz sorry! Try again!
    }
    return privKey;
}
exports.pull = pull;
;
