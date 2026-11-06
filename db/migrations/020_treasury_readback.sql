-- X-only read cache. Rows must be reconstructed from canonical chain receipts.
CREATE TABLE IF NOT EXISTS treasury_deposit_scan (
 venture_id TEXT PRIMARY KEY, token_address TEXT NOT NULL, safe_address TEXT NOT NULL,
 deployment_block TEXT NOT NULL, scanned_through TEXT NOT NULL, block_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS treasury_deposits (
 venture_id TEXT NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL,
 from_address TEXT NOT NULL, amount_raw TEXT NOT NULL, block_number TEXT NOT NULL,
 block_hash TEXT NOT NULL, confirmed_at TEXT NOT NULL,
 PRIMARY KEY(venture_id,tx_hash,log_index)
);
CREATE TABLE IF NOT EXISTS treasury_rejected_evidence (
 venture_id TEXT NOT NULL, tx_hash TEXT NOT NULL, safe_address TEXT NOT NULL,
 call_hash TEXT NOT NULL, block_number TEXT NOT NULL, block_hash TEXT NOT NULL,
 confirmed_at TEXT NOT NULL, trace_output_hash TEXT NOT NULL, review_reference TEXT NOT NULL,
 PRIMARY KEY(venture_id,tx_hash)
);
