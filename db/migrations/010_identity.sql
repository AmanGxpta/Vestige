-- 010_identity: C1-owned identity tables. SQLite dialect (portable subset).
-- PROPOSED until H locks the DB engine (D-00x). If Postgres is chosen, map
-- TEXT->TEXT, INTEGER(ms epoch)->BIGINT; nullifier stays a DECIMAL STRING of
-- the 256-bit value (World docs: store as number, avoid hex/casing bugs).

CREATE TABLE IF NOT EXISTS identity_ventures (
  venture_id     TEXT PRIMARY KEY CHECK (length(venture_id) = 66),
  slug           TEXT NOT NULL UNIQUE,
  ens_name       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'workspace' CHECK (status = 'workspace'),
  ens_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (ens_status IN ('UNKNOWN','PENDING','VERIFIED','FAILED')),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_seats (
  venture_id          TEXT NOT NULL REFERENCES identity_ventures(venture_id),
  wallet              TEXT NOT NULL,
  founder_label       TEXT NOT NULL,
  world_status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (world_status IN ('PENDING','VERIFIED','FAILED')),
  onchain_status      TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (onchain_status IN ('UNKNOWN','PENDING','VERIFIED','FAILED')),
  subname_status      TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (subname_status IN ('UNKNOWN','PENDING','VERIFIED','FAILED')),
  attestation_tx_hash TEXT,
  attestation_chain_id INTEGER,
  attestation_block   INTEGER,
  attested_at         INTEGER,
  verified_at         INTEGER,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (venture_id, wallet),
  UNIQUE (venture_id, founder_label)
);

-- One human per venture: the World nullifier is unique within a venture.
-- (action, nullifier) is also unique so a proof for one action never counts twice.
CREATE TABLE IF NOT EXISTS identity_world_nullifiers (
  venture_id       TEXT NOT NULL REFERENCES identity_ventures(venture_id),
  action           TEXT NOT NULL,
  nullifier        TEXT NOT NULL CHECK (nullifier GLOB '[0-9]*'),
  wallet           TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  environment      TEXT NOT NULL,
  verified_at      INTEGER NOT NULL,
  UNIQUE (venture_id, nullifier),
  UNIQUE (action, nullifier),
  UNIQUE (venture_id, wallet)
);

-- RP-signed World requests: single-use nonce bound to venture + wallet.
CREATE TABLE IF NOT EXISTS identity_world_requests (
  nonce      TEXT PRIMARY KEY,
  venture_id TEXT NOT NULL,
  wallet     TEXT NOT NULL,
  action     TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_invites (
  token_hash TEXT PRIMARY KEY,
  venture_id TEXT NOT NULL REFERENCES identity_ventures(venture_id),
  created_by TEXT NOT NULL,
  used_by    TEXT,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_auth_challenges (
  nonce      TEXT PRIMARY KEY,
  wallet     TEXT NOT NULL,
  message    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_sessions (
  token_hash TEXT PRIMARY KEY,
  wallet     TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Evidence/provenance log (labels: HUMAN_VERIFIED | SIGNED | CHAIN_VERIFIED | SELF_REPORTED).
CREATE TABLE IF NOT EXISTS identity_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  venture_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL CHECK (label IN ('HUMAN_VERIFIED','SIGNED','CHAIN_VERIFIED','SELF_REPORTED')),
  status       TEXT NOT NULL CHECK (status IN ('UNKNOWN','PENDING','VERIFIED','FAILED')),
  actor        TEXT,
  chain_id     INTEGER,
  tx_hash      TEXT,
  block_number INTEGER,
  confirmed_at INTEGER,
  source       TEXT NOT NULL,
  detail       TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_events_venture ON identity_events(venture_id, id);
