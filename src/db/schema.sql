DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE transfers(
  hash                  text        PRIMARY KEY,
  transfer              jsonb       NOT NULL, -- transfer (POD)
  acknowledgement       text            NULL, -- if it's null, it's not yet finalized
  created               timestamptz     NULL DEFAULT NOW() -- prunable
);

CREATE INDEX transfers_change_claimant_idx ON transfers((transfer->'change'->>'claimant')); 


-- this transfer_inputs is really just to provide the unique constraint on input owners :P
CREATE TABLE transfer_inputs(
  owner            text                            PRIMARY KEY,
  transfer_hash    text        NOT NULL REFERENCES transfers(hash)
);
CREATE INDEX transfer_inputs_transfer_hash_idx ON transfer_inputs(transfer_hash);

CREATE TABLE hookins(
  hash                        text            PRIMARY KEY,
  hookin                      jsonb               NULL,   -- can be pruned (only AFER it's imported and AFTER it's safely been spent... )  
  imported                    boolean         NOT NULL DEFAULT false, -- into wallet
  created                     timestamptz         NULL DEFAULT NOW() -- prunable (for debug..)
);
CREATE INDEX hookins_txid_idx ON hookins((hookin->>'txid'));

CREATE TABLE claims(
  hash            text         PRIMARY KEY, -- hash of what's being claimed (either a transfer-change or hookin)
  response        jsonb        NOT NULL,  -- ack'd claim_response
  created         timestamptz  NULL DEFAULT NOW() -- prunable (for debug..)
);

-- this is prunable, for logging only, and might be orphaned -
CREATE TABLE hookouts(
  hash      text      PRIMARY KEY,
  hookout   jsonb         NOT NULL,
  created        timestamptz  NULL DEFAULT NOW()
);

-- SENDING means it's in progress (or locked up)
-- SENT means it's totally done and pushed onto the network
CREATE TYPE TRANSACTION_SEND_STATUS_ENUM AS ENUM('SENDING', 'SENT');

-- note these are only the original transaction and NOT the fee bumped ones --
-- this exists for logging only
CREATE TABLE bitcoin_transactions(
  txid                   text                         PRIMARY KEY,
  hex                    text                         NOT NULL,
  fee                    bigint                       NOT NULL,
  status                 TRANSACTION_SEND_STATUS_ENUM NOT NULL,
  created                timestamptz                  NOT NULL DEFAULT NOW()
);

-- entire row is prunable ---
-- this serves no role other than logging..
CREATE TABLE fee_bumps(
  hash     text    PRIMARY KEY,
  fee_bump jsonb       NOT NULL,
  new_txid text           NULL, -- only set after the bump succeeds
  created  timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX fee_bumps_txid_idx ON fee_bumps((fee_bump->>'txid'));