/**
 * Drop-in gate for reviewed deployment manifests (CR-C2-008 hosting convention).
 * Every file in public/manifests/ must be named exactly `<ensName>.json`, pass the same
 * validator the browser uses, and match the ENS name in its filename. Until X publishes a
 * reviewed manifest the directory does not exist and this suite only checks that no
 * placeholder was committed.
 *
 * After dropping the file in: `pnpm test src/modules/public-view/manifest-dropin.test.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestUrlFor, validateManifest } from "./manifest";

const DIR = join(process.cwd(), "public", "manifests");
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
      if (ensName === "northstar.vestige.eth") expect(m.ventureId).toBe("0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff");
    });
  }
});
