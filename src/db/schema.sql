DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TRUNCATE claimables, transfer_inputs, bitcoin_transactions, bitcoin_transactions_manual, nonces, statuses;

CREATE TABLE claimables(
  claimable             jsonb       NOT NULL, -- ack'd claimable (POD)
  created               timestamptz     NULL DEFAULT NOW() -- prunable
);
CREATE UNIQUE INDEX claimables_hash_idx ON claimables((claimable->>'hash'));
CREATE INDEX claimables_kind_idx ON claimables((claimable->>'kind'));
CREATE INDEX claimable_claimant_idx ON claimables((claimable->>'claimant'));
CREATE INDEX claimables_invoice_payment_request_idx ON claimables((claimable->>'paymentRequest')) WHERE ((claimable->>'kind'='LightningInvoice'));


ALTER TABLE claimables ADD CONSTRAINT claimable_hash_check CHECK (jsonb_typeof(claimable->'hash') IS NOT DISTINCT FROM 'string');
ALTER TABLE claimables ADD CONSTRAINT claimable_kind_check CHECK (jsonb_typeof(claimable->'kind') IS NOT DISTINCT FROM 'string');
ALTER TABLE claimables ADD CONSTRAINT claimable_acknowledgement_check CHECK (jsonb_typeof(claimable->'acknowledgement') IS NOT DISTINCT FROM 'string');



-- this transfer_inputs is really just to provide the unique constraint on input owners :P
CREATE TABLE transfer_inputs(
  owner            text                            PRIMARY KEY,
  transfer_hash    text        NOT NULL          --  REFERENCES claimables((claimable->>'hash'))
);
CREATE INDEX transfer_inputs_transfer_hash_idx ON transfer_inputs(transfer_hash);


-- SENDING means it's in progress (or locked up)
-- SENT means it's totally done and pushed onto the network
CREATE TYPE TRANSACTION_SEND_STATUS_ENUM AS ENUM ('SENDING','SENT');

-- note these are only the original transaction and NOT the fee bumped ones --
CREATE TABLE bitcoin_transactions(
  txid                   text                         PRIMARY KEY,
  hex                    text                         NOT NULL,
  fee                    bigint                       NOT NULL,
  status                 TRANSACTION_SEND_STATUS_ENUM NOT NULL,
  created                timestamptz                  NOT NULL DEFAULT NOW()
);

CREATE TABLE statuses(
  status                 jsonb       NOT NULL, -- an ack'd status object
  created                timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX statuses_hash_idx ON statuses((status->>'hash'));

-- we shouldn't really be relying on these hard-coded failsafes anyway.
-- CREATE UNIQUE INDEX statuses_claimable_hash_kind_idx ON statuses((status->>'claimableHash'),  (status->>'kind'));
CREATE INDEX statuses_kind_idx ON statuses((status->>'kind'));


CREATE OR REPLACE VIEW lightning_invoices AS SELECT
  claimable->>'hash',
  claimable->>'claimant' as claimant,
  claimable->>'paymentRequest' as paymentRequest,
  claimable->>'acknowledgement' as acknowledgement,
  created,
  (SELECT jsonb_agg(status) FROM statuses WHERE status->>'claimableHash' = claimable->>'hash') as statuses,
  claimable
FROM claimables WHERE claimable->>'kind'='LightningInvoice';

-- saving nonces to db
CREATE TABLE nonces(
  nonce             text       NOT NULL, -- public
  privkey         text       NOT NULL, -- private scalar in pod
  created               timestamptz     NULL DEFAULT NOW() --
);

-- Unnecessary, merge with bitcoin_transactions?
CREATE TABLE bitcoin_transactions_manual( 
  transaction jsonb NOT NULL,
  created               timestamptz     NULL DEFAULT NOW() 
);

-- PASSWORD === password in postgresql.conf
CREATE ROLE replication_user WITH LOGIN PASSWORD 'PASSWORD' REPLICATION;

-- logical replication on different server. 
CREATE ROLE replication_user2 WITH LOGIN PASSWORD 'PASSWORD2' REPLICATION;
GRANT USAGE on schema public to replication_user2;
GRANT SELECT ON DATABASE "captain-hook" TO replication_user2;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replication_user2;

-- for logical replication
CREATE PUBLICATION captain_hook_publication_logical_rep FOR ALL TABLES;


-- logical replication... nested on different server
CREATE ROLE replication_user_nested_replication WITH LOGIN PASSWORD 'PASSWORD2' REPLICATION;
GRANT USAGE on schema public to replication_user_nested_replication;
GRANT ALL PRIVILEGES ON DATABASE "postgres" TO replication_user_nested_replication;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO replication_user_nested_replication;
