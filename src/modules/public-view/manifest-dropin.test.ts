/**
 * Drop-in gate for reviewed deployment manifests (CR-C2-008 hosting convention).
 * Every file in public/manifests/ must be named exactly `<ensName>.json`, pass the same
 * validator the browser uses, and match the ENS name in its filename. Until X publishes a
 * reviewed manifest the directory does not exist and this suite only checks that no
 * placeholder was committed.
 *
 * Drop-in procedure: copy X's file byte-for-byte, put X's published SHA-256 in PINNED_SHA256 in the
 * same commit, then `pnpm test src/modules/public-view/manifest-dropin.test.ts`. A file without a
 * pinned digest fails. (MANIFEST_SHA256 env can be used to check before pinning.)
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestUrlFor, validateManifest } from "./manifest";

const DIR = join(process.cwd(), "public", "manifests");
/** X-published SHA-256 over the exact file bytes. Filled only from X's report — never computed locally and pasted. */
const PINNED_SHA256: Record<string, string> = {
  // X: agent/treasury contracts/manifests/published/northstar.vestige.eth-4504d9782084.json (H-relayed digest)
  "northstar.vestige.eth.json": "ebee268619a6bc5075f5ee41aed1d66aa5516d590c5b7b892e99274b50e602ef",
};
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => !f.startsWith(".")) : [];

describe("public/manifests drop-in", () => {
  it("contains only reviewed <label>.vestige.eth.json files", () => {
    for (const f of files) expect(f).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vestige\.eth\.json$/);
  });

  for (const f of files) {
    it(`${f} passes the DeploymentManifestV1 validator and matches its filename`, () => {
      const m = JSON.parse(readFileSync(join(DIR, f), "utf8")) as { ensName?: string; ventureId?: string };
      expect(validateManifest(m)).toEqual([]);
      const ensName = f.replace(/\.json$/, "");
      expect(m.ensName).toBe(ensName);
      expect(manifestUrlFor("/manifests/{ensName}.json", ensName)).toBe(`/manifests/${ensName}.json`);
      if (ensName === "northstar.vestige.eth") {
        expect(m.ventureId).toBe("0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff");
      }
      const want = (process.env.MANIFEST_SHA256 ?? PINNED_SHA256[f] ?? "").trim().toLowerCase().replace(/^0x/, "");
      // A dropped-in file must match X's digest; refuse to pass silently without one.
      expect(want, `pin X's SHA-256 for ${f} in PINNED_SHA256`).toMatch(/^[0-9a-f]{64}$/);
      expect(createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex")).toBe(want);
    });
  }
});
