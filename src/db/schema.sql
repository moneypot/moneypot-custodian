DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE transfers(
  hash                  text        PRIMARY KEY,
  transfer              jsonb       NOT NULL, -- acknowledged transfer
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

CREATE INDEX hookouts_txid_idx ON hookouts(txid);
