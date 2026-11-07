/**
 * OPERATOR COMMAND (CR-ID-06, H-requested demo override). Writes ONLY to the local server DB.
 *   VESTIGE_DEMO_OVERRIDE=1 VESTIGE_DB_PATH=<server sqlite> VENTURE_ID=<id> SEAT_WALLET=<0x…> \
 *   OVERRIDE_REASON="…" OVERRIDE_OPERATOR="H" npx vitest run --config tests/identity/vitest.config.ts demo-override.live
 * Guardrails live in VentureService.demoOverrideSeat (staging-only, one per venture, needs a real proof).
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateIdentity, SqliteDb } from "../../../src/modules/identity/db";
import { ApprovalGatedEnsPort, UnconfiguredPort } from "../../../src/modules/identity/ports";
import { VentureService } from "../../../src/modules/identity/ventures";

const RUN = process.env.VESTIGE_DEMO_OVERRIDE === "1";

describe.skipIf(!RUN)("OPERATOR: demo override one seat", () => {
  it("marks the seat ready (never HUMAN_VERIFIED)", async () => {
    const path = process.env.VESTIGE_DB_PATH!;
    if (!path || !existsSync(path)) throw new Error("VESTIGE_DB_PATH must point at the existing server DB");
    const db = new SqliteDb(path);
    migrateIdentity(db);
    const v = new VentureService({ db, world: null, attester: new UnconfiguredPort("SeatRegistry attester"), ens: new ApprovalGatedEnsPort() });
    const out = await v.demoOverrideSeat(process.env.VENTURE_ID, process.env.SEAT_WALLET, { reason: process.env.OVERRIDE_REASON ?? "", operator: process.env.OVERRIDE_OPERATOR ?? "" });
    console.log(JSON.stringify({ seat: out.seat, attestation: out.attestation, humansVerified: v.view(process.env.VENTURE_ID).humansVerified }));
    expect(out.seat.demoOverride).toBe(true);
  });
});
