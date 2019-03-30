DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE transfers(
  hash             text        PRIMARY KEY,
  transfer         jsonb       NOT NULL, -- acknowledged transfer
  created          timestamptz     NULL DEFAULT NOW() -- prunable
);

-- this transfer_inputs is really just to provide the unique constraint on input owners :P
CREATE TABLE transfer_inputs(
  owner            text                            PRIMARY KEY,
  transfer_hash    text        NOT NULL REFERENCES transfers(hash)
);
CREATE INDEX transfer_inputs_transfer_hash_idx ON transfer_inputs(transfer_hash);

CREATE TABLE hookins(
  hash                        text            PRIMARY KEY,
  claim_response              jsonb           NOT NULL,  -- ack'd claim_response
  hookin                      jsonb               NULL,   -- can be pruned (only AFER it's been spent... )
  imported                    boolean         NOT NULL DEFAULT false
);


CREATE TABLE bounties(
  hash                              text             PRIMARY KEY,
  bounty                            jsonb               NULL, -- debug only. fully prunable. We only need the bounty hash...
  -- the claim response actually contains the claim request ;D
  claim_response                    jsonb                NULL -- ack'd. only exists if it's been claimed...
);


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

--  once a hookout is safely sent, it's *completely* prunable (e.g. we can just delete the whole row!)
CREATE TABLE hookouts(
  hash      text      PRIMARY KEY,
  hookout   jsonb            NULL,
  txid      text             NULL REFERENCES bitcoin_transactions(txid)
);

CREATE INDEX hookouts_transfer_txid_idx ON hookouts(txid);
