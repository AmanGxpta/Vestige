-- 010_identity_v0_followthrough: C1 tables for CONTRACTS v0 @30d1ef6 follow-through.
-- Additive only (CREATE ... IF NOT EXISTS); no ALTER of earlier 010_* tables.

-- CR-C2-001 public-list consent. A venture is listed only while EVERY current
-- seat holder has listed = 1. Default (no row) = not consented. Any founder can withdraw.
CREATE TABLE IF NOT EXISTS identity_listing_consent (
  venture_id TEXT NOT NULL REFERENCES identity_ventures(venture_id),
  wallet     TEXT NOT NULL,
  listed     INTEGER NOT NULL CHECK (listed IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (venture_id, wallet),
  FOREIGN KEY (venture_id, wallet) REFERENCES identity_seats(venture_id, wallet)
);

-- Idempotency-Key ledger: scoped to session wallet + route + key; body digest pins the request.
CREATE TABLE IF NOT EXISTS identity_idempotency (
  wallet        TEXT NOT NULL,
  route         TEXT NOT NULL,
  idem_key      TEXT NOT NULL,
  body_digest   TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'DONE')),
  status_code   INTEGER,
  response_json TEXT,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (wallet, route, idem_key)
);

-- Server-issued EIP-712 FoundingTerms nonces. A signature is accepted only for a
-- nonce issued to that signer for that exact version + docHash, before its expiry.
CREATE TABLE IF NOT EXISTS agreement_sign_nonces (
  venture_id TEXT NOT NULL,
  signer     TEXT NOT NULL,
  nonce      TEXT NOT NULL CHECK (nonce GLOB '[0-9]*'),
  version    INTEGER NOT NULL,
  doc_hash   TEXT NOT NULL,
  expiry     INTEGER NOT NULL,
  issued_at  INTEGER NOT NULL,
  used_at    INTEGER,
  PRIMARY KEY (signer, nonce)
);
