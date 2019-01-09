DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE transfers(
  hash            text        PRIMARY KEY,
  source_hash     text        NOT NULL, -- hash (can be a transaction_hookins(hash), a lightning_hookins(hash) or a set of spent_coins)
  output_hash     text        NOT NULL,
  acknowledgement text        NOT NULL,
  created         timestamptz     NULL DEFAULT NOW() -- prunable
);

CREATE TABLE spent_coins(
   owner                      text     PRIMARY KEY,
   transfer_hash              text     NOT NULL REFERENCES transfers(hash),
   magnitude                  smallint NOT NULL,
   existence_proof            text     NOT NULL, -- unblinded signature
   spend_proof                text     NOT NULL -- signature of owner signs the transfer_hash
);
CREATE INDEX spent_coins_transfer_hash_idx on spent_coins(transfer_hash);

CREATE TABLE claimable_coins(
  id                        bigserial         PRIMARY KEY, -- internal synthetic key to refer to it
  transfer_hash             text                  NULL REFERENCES transfers(hash), -- DEBUG_ONLY
  claimant                  text              NOT NULL, -- can be dupes, but highly discouraged
  magnitude                 smallint          NOT NULL,
  -- IF it gets claimed these are (all) set --
  claim_request_hash          text                NULL,
  claim_request_blind_nonce   text                NULL,
  claim_request_blinded_owner text                NULL,
  claim_request_authorization text                NULL,
  -- the response we gave --
  blinded_existence_proof   text                  NULL,
  acknowledgement           text                  NULL
);

CREATE INDEX claimable_coins_transfer_hash_idx ON claimable_coins(transfer_hash);
CREATE INDEX claimable_coins_claimant_idx ON claimable_coins(claimant);


CREATE TABLE transaction_hookins(
  hash                        text        PRIMARY KEY,
  transfer_hash               text        NOT NULL REFERENCES transfers(hash),
  -- everything below is prunable data (after it's been spent...)
  txid                        text        NULL,
  vout                        int         NULL,
  credit_to                   text        NULL,
  derive_index                bigint      NULL, -- to store a uint32
  tweak                       text        NULL, -- debug info
  deposit_address             text        NULL, -- debug info
  amount                      bigint      NULL, -- debug info
  fee                         int         NULL  -- debug info
);
CREATE UNIQUE INDEX transaction_hookins_transfer_hash_idx ON transaction_hookins(transfer_hash);

-- interestingly once a hookout is safely sent, it's *completely* prunable (e.g. we can just delete it!)
CREATE TABLE transaction_hookouts(
  id                            uuid    PRIMARY KEY DEFAULT uuid_generate_v4(), -- internal synthetic key to refer to it. We use a uuid to not leak how many we have previously generated
  hash                           text    NOT NULL, -- this can technically have dupes
  transfer_hash                  text        NULL REFERENCES transfers(hash),  -- DEBUG_ONLY
  amount                         bigint  NOT NULL,
  bitcoin_address                text    NOT NULL,
  nonce                          text    NOT NULL,
  priority                       text    NOT NULL  -- should be an enum?
);


CREATE INDEX transaction_hookouts_transfer_hash_idx ON transaction_hookouts(transfer_hash);



-- CREATE OR REPLACE FUNCTION jsonize_transaction(t transactions) RETURNS jsonb
--     AS $$
--       SELECT jsonb_build_object(
--       'hash', t.hash,
--       'sourceHash', t.source_hash,
--       'sourceInputs', (
--         SELECT jsonb_agg(jsonb_build_object(
--           'owner', transaction_inputs.owner,
--           'coinMagnitude', transaction_inputs.coin_magnitude,
--           'existenceProof', transaction_inputs.existence_proof,
--           'spendProof', transaction_inputs.spend_proof 
--         ))
--         FROM transaction_inputs
--       WHERE transaction_inputs.transfer_hash = t.hash
--      ),
--       'claimableOutputs', (
--             SELECT jsonb_agg(jsonb_build_object(
--                   'claimant', claimable_outputs.claimant,
--                   'coinMagnitude', claimable_outputs.coin_magnitude
--             ))
--             FROM claimable_outputs
--             WHERE claimable_outputs.transfer_hash = t.hash
--            ),
--       'defundingOutput', (
--           SELECT jsonb_build_object('priority', defunding_outputs.priority)
--           FROM defunding_outputs
--           WHERE defunding_outputs.transfer_hash = t.hash
--        ),
--        'acknowledgement', t.acknowledgement
--     )
--     $$
--     LANGUAGE SQL
--     IMMUTABLE
--     RETURNS NULL ON NULL INPUT;
