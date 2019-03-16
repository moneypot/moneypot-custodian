DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE transfers(
  hash             text        PRIMARY KEY,
  input            text        NOT NULL UNIQUE, -- hash (can be a transaction_hookins(hash), a lightning_hookins(hash) or a set of spent_coins)
  output           text        NOT NULL UNIQUE,
  "authorization"  text        NOT NULL UNIQUE,
  acknowledgement  text        NOT NULL UNIQUE,
  created          timestamptz     NULL DEFAULT NOW() -- prunable
);


CREATE TABLE hookins(
  hash                        text        PRIMARY KEY,
  transfer_hash               text        NOT NULL REFERENCES transfers(hash),
  -- everything below is prunable data (after it's been spent...)
  txid                        text            NULL,
  vout                        int             NULL,
  amount                      bigint          NULL,
  credit_to                   text            NULL,
  derive_index                bigint          NULL, -- to store a uint32
  tweak                       text            NULL, -- debug info
  deposit_address             text            NULL -- debug info
);
CREATE UNIQUE INDEX hookins_transfer_hash_idx ON hookins(transfer_hash);



CREATE TABLE bounties(
  hash                              text             PRIMARY KEY,
  transfer_hash                     text                  NULL REFERENCES transfers(hash), -- this exists purely for debugging..
  amount                            bigint           NOT NULL CHECK(amount >= 0),
  claimant                          text             NOT NULL,
  nonce                             text             NOT NULL,
  -- the claim response actually contains the claim request ;D
  claim_response                    jsonb                NULL
);

CREATE UNIQUE INDEX bounties_transfer_hash_idx ON bounties(transfer_hash);
CREATE INDEX bounties_claimant_idx ON bounties(claimant);


CREATE TABLE spent_coins(
   owner                      text     PRIMARY KEY,
   transfer_hash              text     NOT NULL REFERENCES transfers(hash),
   magnitude                  smallint NOT NULL CHECK(magnitude >= 0 AND magnitude <= 30),
   existence_proof            text     NOT NULL -- unblinded signature
);
CREATE INDEX spent_coins_transfer_hash_idx on spent_coins(transfer_hash);




-- SENDING means it's in progress (or locked up)
-- SENT means it's totally done and pushed onto the network
CREATE TYPE TRANSACTION_SEND_STATUS_ENUM AS ENUM('SENDING', 'SENT', 'FAILED');

CREATE TABLE bitcoin_transactions(
  txid                   text                         PRIMARY KEY,
  hex                    text                         NOT NULL,
  fee                    bigint                       NOT NULL,
  status                 TRANSACTION_SEND_STATUS_ENUM NOT NULL,
  created                timestamptz                  NOT NULL DEFAULT NOW()
);

-- interestingly once a hookout is safely sent, it's *completely* prunable (e.g. we can just delete it!)
CREATE TABLE hookouts(
  hash                           text     PRIMARY KEY,
  transfer_hash                  text         NULL REFERENCES transfers(hash),  -- DEBUG_ONLY
  amount                         bigint   NOT NULL,
  bitcoin_address                text     NOT NULL,
  nonce                          text     NOT NULL,
  immediate                      boolean  NOT NULL,
  txid                           text         NULL REFERENCES bitcoin_transactions(txid)
);

CREATE INDEX hookouts_transfer_hash_idx ON hookouts(transfer_hash);
CREATE INDEX hookouts_transfer_txid_idx ON hookouts(txid);
