-- 010_identity_agreements: C1-owned founding agreement tables (SQLite dialect, PROPOSED).
-- Full canonical JSON is PRIVATE (never served publicly); only doc_hash is public.

CREATE TABLE IF NOT EXISTS agreement_versions (
  venture_id     TEXT NOT NULL,
  agreement_id   TEXT NOT NULL CHECK (length(agreement_id) = 66),
  version        INTEGER NOT NULL CHECK (version >= 1),
  canonical_json TEXT NOT NULL,
  doc_hash       TEXT NOT NULL CHECK (length(doc_hash) = 66),
  created_by     TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  superseded_at  INTEGER,
  ens_status     TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (ens_status IN ('UNKNOWN','PENDING','VERIFIED','FAILED')),
  PRIMARY KEY (venture_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS agreement_versions_current
  ON agreement_versions(venture_id) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS agreement_signatures (
  venture_id   TEXT NOT NULL,
  version      INTEGER NOT NULL,
  agreement_id TEXT NOT NULL,
  doc_hash     TEXT NOT NULL,
  signer       TEXT NOT NULL,
  nonce        TEXT NOT NULL,
  expiry       INTEGER NOT NULL,
  signature    TEXT NOT NULL,
  verified_at  INTEGER NOT NULL,
  PRIMARY KEY (venture_id, version, signer),
  UNIQUE (signer, nonce),
  FOREIGN KEY (venture_id, version) REFERENCES agreement_versions(venture_id, version)
);
