-- 010_identity_demo_override: H-requested DEMO override (CR-ID-06, time-boxed). Additive.
-- A row here means the seat was marked ready by an OPERATOR, not by a World ID proof.
-- It is never HUMAN_VERIFIED, never counted in humansVerified / vestige.humans, never gets
-- an ENS subname, and never writes identity_world_nullifiers.
CREATE TABLE IF NOT EXISTS identity_seat_overrides (
  venture_id TEXT NOT NULL REFERENCES identity_ventures(venture_id),
  wallet     TEXT NOT NULL,
  reason     TEXT NOT NULL,
  operator   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (venture_id, wallet),
  FOREIGN KEY (venture_id, wallet) REFERENCES identity_seats(venture_id, wallet)
);
