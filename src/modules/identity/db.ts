/**
 * Minimal SQL port. D-009 (APPROVED): SQLite via Node's built-in `node:sqlite`,
 * WAL, migrations, foreign keys, busy timeout, unique constraints; one host.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | bigint | null;
export type Row = Record<string, SqlValue>;

export interface SqlDb {
  run(sql: string, ...params: SqlValue[]): { changes: number };
  get<T = Row>(sql: string, ...params: SqlValue[]): T | undefined;
  all<T = Row>(sql: string, ...params: SqlValue[]): T[];
  /** Runs fn atomically; rethrows after rollback. */
  tx<T>(fn: () => T): T;
}

export function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE constraint failed|duplicate key value/i.test(msg);
}

export class SqliteDb implements SqlDb {
  readonly raw: DatabaseSync;
  private depth = 0;
  constructor(path = ":memory:") {
    this.raw = new DatabaseSync(path);
    // CONTRACTS v0: WAL, foreign keys, busy timeout (single host, persistent disk).
    this.raw.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  run(sql: string, ...params: SqlValue[]) {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }
  get<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }
  all<T = Row>(sql: string, ...params: SqlValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.raw.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const out = fn();
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
export const IDENTITY_MIGRATIONS = [
  join(here, "../../../db/migrations/010_identity.sql"),
  join(here, "../../../db/migrations/010_identity_agreements.sql"),
  join(here, "../../../db/migrations/010_identity_v0_followthrough.sql"),
  join(here, "../../../db/migrations/010_identity_demo_override.sql"),
];

/** Applies C1's migrations (idempotent: CREATE ... IF NOT EXISTS). */
export function migrateIdentity(db: SqliteDb, files = IDENTITY_MIGRATIONS): void {
  for (const f of files) db.raw.exec(readFileSync(f, "utf8"));
}
