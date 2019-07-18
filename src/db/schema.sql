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



-- SENDING means it's in progress (or locked up)
-- SENT means it's totally done and pushed onto the network
CREATE TYPE TRANSACTION_SEND_STATUS_ENUM AS ENUM('SENDING', 'SENT');

-- note these are only the original transaction and NOT the fee bumped ones --
CREATE TABLE bitcoin_transactions(
  txid                   text                         PRIMARY KEY,
  hex                    text                         NOT NULL,
  fee                    bigint                       NOT NULL,
  status                 TRANSACTION_SEND_STATUS_ENUM NOT NULL,
  created                timestamptz                  NOT NULL DEFAULT NOW()
);

CREATE TABLE hookouts(
  hash           text      PRIMARY KEY,
  hookout        jsonb         NOT NULL,
  processed_by   text              NULL REFERENCES bitcoin_transactions(txid),
  created        timestamptz  NULL DEFAULT NOW()
);

CREATE INDEX hookouts_processed_by_idx ON hookouts(processed_by);



-- entire row is prunable ---
-- this serves no role other than logging..
CREATE TABLE fee_bumps(
  hash     text    PRIMARY KEY,
  fee_bump jsonb       NOT NULL,
  new_txid text           NULL, -- only set after the bump succeeds
  created  timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX fee_bumps_txid_idx ON fee_bumps((fee_bump->>'txid'));


-- lightning invoices are totally prunable
CREATE TABLE lightning_invoices(
  hash                 text        PRIMARY KEY,
  lightning_invoice    jsonb       NOT NULL, -- ack'd lightningInvoice
  r_hash               text        NOT NULL, -- hex
  settle_index         bigint      NOT NULL DEFAULT 0,  -- from lnd, otherwise  0
  settle_amount        bigint      NOT NULL DEFAULT 0,  -- only set when it's paid, otherwise 0
  created              timestamptz NOT NULL DEFAULT NOW()
  --  , CHECK(payment IS NULL OR payment->'value_sat' IS INT)
);

CREATE INDEX lightning_invoices_beneficiary_idx ON lightning_invoices((lightning_invoice->'beneficiary'));
CREATE UNIQUE INDEX lightning_invoices_r_hash_idx ON lightning_invoices(r_hash);
CREATE INDEX lightning_invoices_settle_index ON lightning_invoices(settle_index);

CREATE TABLE lightning_payments(
  hash             text       PRIMARY KEY,
  lightning_payment text       NOT NULL,
  payment_preimage  text           NULL, -- only set if payment once payment succeeds
  created              timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX lightning_payments_unq_request_idx ON lightning_payments((lightning_payment->'paymentRequest'));
CREATE UNIQUE INDEX lightning_payments_unq_preimage_idx ON lightning_payments(payment_preimage);