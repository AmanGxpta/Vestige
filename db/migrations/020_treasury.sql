-- X-owned; additive SQLite schema. C1 owns identity_* and creates those first.
CREATE TABLE IF NOT EXISTS treasury_deployments (
 venture_id TEXT PRIMARY KEY REFERENCES identity_ventures(venture_id),
 manifest_json TEXT, source TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS treasury_payments (
 payment_id TEXT PRIMARY KEY, venture_id TEXT NOT NULL REFERENCES identity_ventures(venture_id),
 recipient TEXT NOT NULL, amount_raw TEXT NOT NULL, reason TEXT NOT NULL,
 safe_nonce TEXT NOT NULL, safe_tx_hash TEXT NOT NULL, typed_json TEXT NOT NULL,
 created_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('AWAITING_APPROVALS','READY','EXECUTED','FAILED')),
 operation_id TEXT, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_one_proposal_per_nonce ON treasury_payments(venture_id,safe_nonce) WHERE status!='FAILED';
CREATE TABLE IF NOT EXISTS treasury_signatures (
 payment_id TEXT NOT NULL REFERENCES treasury_payments(payment_id), signer TEXT NOT NULL,
 signature TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(payment_id,signer)
);
CREATE TABLE IF NOT EXISTS treasury_operations (
 operation_id TEXT PRIMARY KEY, venture_id TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RESERVED','UNKNOWN','SUBMITTED','EXECUTED','FAILED')),
 relay_id TEXT, tx_hash TEXT, block_number TEXT, block_hash TEXT, confirmed_at INTEGER,
 error_code TEXT, source TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS treasury_idempotency (
 wallet TEXT NOT NULL, route TEXT NOT NULL, idempotency_key TEXT NOT NULL, body_digest TEXT NOT NULL,
 operation_id TEXT NOT NULL REFERENCES treasury_operations(operation_id), response_json TEXT NOT NULL,
 http_status INTEGER NOT NULL, PRIMARY KEY(wallet,route,idempotency_key)
);
CREATE TABLE IF NOT EXISTS treasury_attestations (
 venture_id TEXT NOT NULL, wallet TEXT NOT NULL, nullifier_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RESERVED','UNKNOWN','SUBMITTED','CONFIRMED','FAILED')),
 sender TEXT, sender_nonce TEXT, call_hash TEXT, tx_hash TEXT UNIQUE, block_number TEXT, block_hash TEXT, confirmed_at INTEGER,
 PRIMARY KEY(venture_id,wallet), UNIQUE(venture_id,nullifier_hash)
);
