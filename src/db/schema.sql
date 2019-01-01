CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS plv8;

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;



CREATE TABLE transactions(
  hash            text    PRIMARY KEY, -- hash of (source + claimable_outputs + defunding_outputs)
  source_hash          text    NOT NULL UNIQUE, -- hash (can be a hookin-hash or a set of spent_coins)
  acknowledgement text    NOT NULL,
  created         timestamptz NULL DEFAULT NOW() -- prunable
);

CREATE TABLE transaction_inputs(
   owner                          text PRIMARY KEY,
   coin_magnitude             smallint NOT NULL,
   existence_proof                text NOT NULL, -- unblinded signature
   spend_proof                    text NOT NULL, -- signature that signs the transactions_output_hash
   transaction_hash               text     NULL REFERENCES transactions(hash), -- prunable..
);

CREATE TABLE claimable_outputs(
  id                        bigserial         PRIMARY KEY, -- internal synthetic key to refer to it
  claimant                  text              NOT NULL, -- can be dupes, but highly discouraged
  coin_magnitude            smallint          NOT NULL,
  -- the transaction_hash is prunable IFF it's not related to a hookin (e.g. hookins outputs must always be linked!)
  transaction_hash   text              NULL REFERENCES transactions(hash),
   -- everything below is debug/prunable ---
  created                     timestamptz     NULL DEFAULT NOW()
);

CREATE INDEX claimable_outputs_claimant_idx ON claimable_outputs(claimant);
CREATE INDEX claimable_outputs_transaction_hash_idx ON claimable_outputs(transaction_hash);


CREATE TABLE hookins(
  hash                        text        PRIMARY KEY,  -- hash of  (txid,vout,tweaked_by)
  transaction_hash            text        NOT NULL REFERENCES transactions(hash),
  --
  imported                    timestamptz     NULL, -- really should be in a different table..  if the hookin was imported, what time..
  -- everything below is debug/prunable data
  txid                        text        NULL,
  vout                        int         NULL,
  credit_to                   text        NULL,
  derive_index                bigint      NULL, -- to store a uint32
  tweak                       text        NULL,
  deposit_address             text        NULL,
  amount                      bigint      NULL,
  fee                         int         NULL,
  created                     timestamptz NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hookins_transaction_hash_idx ON hookins(transaction_hash);

CREATE INDEX hookins_not_imported_idx ON  hookins(imported) WHERE imported IS NULL;


CREATE TABLE defunding_outputs(
  id                        bigserial    PRIMARY KEY, -- internal synthetic key to refer to it
  priority                       text    NOT NULL, -- should be an enum?
  amount                         bigint  NOT NULL,
  bitcoin_address                text    NOT NULL,
  transaction_hash               text        NULL REFERENCES transactions(hash),   -- debug and prunable
  created                        timestamptz NULL  DEFAULT NOW() -- debug and prunable
);

CREATE INDEX defunding_transaction_hash_idx ON defunding_outputs(transaction_hash);


CREATE TABLE claims(
  claimable_output_id         bigint      PRIMARY KEY REFERENCES claimable_outputs(id),
  claim                       jsonb       NULL, -- the claim they made --
  claimant_signature          text        NULL, -- proof they made the claim --
  claim_blinded_signature     text        NULL, -- what we gave them in response
  created                     timestamptz NULL DEFAULT NOW()
);





CREATE INDEX spent_coins_transaction_hash_idx ON spent_coins(transaction_hash);

