/**
 * DEV MOCK chain report — builds a PublicChainReport from the DEV MOCK store so
 * the public page's layout/states can be tested before real ENS/Whitechain
 * records exist. Every step is marked source DEV_MOCK and the page shows a
 * full-width DEV MOCK banner. Never used unless explicitly requested via
 * `?source=mock` in a non-production build.
 */
import type { VestigeClient } from "@/src/modules/ui/adapter";
import type { PublicChainReport, Provenance, Step } from "./chain-reader";
import type { DeploymentManifestV1 } from "./manifest";
import type { Address, Hex } from "@/src/modules/ui/types";

const MOCK_HASH = (c: string) => `0x${c.repeat(64)}` as Hex;

export async function readMockChainReport(ensName: string, client: VestigeClient): Promise<PublicChainReport> {
  const startedAt = new Date().toISOString();
  const prov = (method: string, chainId: number): Provenance => ({ chainId, method, source: "DEV_MOCK" });
  const pub = await client.getPublicEvidence(ensName);
  if (!pub.ok) {
    const f: Step<never> = { status: "FAILED", note: pub.error.message, provenance: prov("mock lookup", 11155111) };
    return { ensName, startedAt, source: "DEV_MOCK", ens: { resolver: f, treasury: f, texts: f, ventureId: f }, manifest: { status: "NOT_CONFIGURED" } };
  }
  const tr = await client.getTreasury(pub.value.ventureId);
  const t = tr.ok ? tr.value.treasury : undefined;
  const ok = <T,>(value: T, method: string, chainId: number): Step<T> => ({ status: "VERIFIED", value, provenance: prov(method, chainId) });
  const pending = <T,>(method: string, chainId: number, note: string): Step<T> => ({ status: "PENDING", note, provenance: prov(method, chainId) });

  const report: PublicChainReport = {
    ensName,
    normalizedName: ensName.toLowerCase(),
    startedAt,
    source: "DEV_MOCK",
    ens: {
      resolver: ok("0x0000000000000000000000000000000000000000", "mock resolver", 11155111),
      treasury: t
        ? ok({ address: t.safeAddress, via: "ENSIP-11" as const }, "mock addr(coinType 2147485522)", 11155111)
        : { status: "FAILED", note: "No treasury has been set up for this venture yet.", provenance: prov("mock addr", 11155111) },
      texts: ok(
        {
          "vestige.ventureId": pub.value.ventureId,
          "vestige.status": "workspace",
          "vestige.humans": String(pub.value.humansVerified),
          "vestige.agreement": pub.value.agreement?.docHash ?? null,
          "vestige.guard": t?.guardAddress ?? null,
        },
        "mock text records",
        11155111,
      ),
      ventureId: ok(pub.value.ventureId, "mock text(vestige.ventureId)", 11155111),
    },
    manifest: { status: "NOT_CONFIGURED" },
  };
  if (!t || !tr.ok) return report;
  const art = (address: Address, c: string) => ({ address, deploymentTxHash: t.deploymentTxHash, deploymentBlock: 0, runtimeCodeHash: MOCK_HASH(c), abiPath: "contracts/abi/DEV_MOCK.json", abiSha256: "0".repeat(64) });
  const manifest: DeploymentManifestV1 = {
    schemaVersion: 1,
    network: "whitechain-sepolia",
    chainId: 1874,
    deploymentBlock: 0,
    sourceCommit: "0".repeat(40),
    explorerBaseUrl: "https://explorer.testnet.whitechain.io",
    ventureId: pub.value.ventureId,
    ensName: pub.value.ensName,
    owners: [t.ownerAddresses[0], t.ownerAddresses[1]],
    threshold: 2,
    setupInitializerHash: MOCK_HASH("0"),
    approvedAt: new Date().toISOString(),
    contracts: {
      safe: art(t.safeAddress, "1"),
      guard: art(t.guardAddress, "2"),
      registry: art(t.registryAddress, "3"),
      singleton: art("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", "4"),
      factory: art("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", "5"),
      setup: art(t.registryAddress, "6"),
      token: {
        ...art("0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", "7"),
        decimals: 6,
        eip712Domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" },
        domainSeparator: MOCK_HASH("8"),
        implementation: art("0x26425662D126412128967ECf0a02EC48573026F7", "9"),
      },
    },
  };
  report.manifest = { status: "LOADED", manifest, url: "DEV MOCK manifest (simulated)" };
  const live = t.verificationStatus === "ACTIVE";
  report.whitechain = live
    ? {
        blockNumber: ok("0", "mock block", 1874),
        safeCode: ok(true, "mock getCode", 1874),
        version: ok("1.4.1", "mock VERSION", 1874),
        owners: ok(t.ownerAddresses, "mock getOwners", 1874),
        threshold: ok(t.threshold, "mock getThreshold", 1874),
        guard: ok(t.guardAddress, "mock guard slot", 1874),
        binding: ok({ safe: t.safeAddress, registry: t.registryAddress, ventureId: pub.value.ventureId }, "mock Guard binding", 1874),
        codeHashes: ok({ safe: MOCK_HASH("1"), guard: MOCK_HASH("2"), registry: MOCK_HASH("3") }, "mock code hashes", 1874),
        modules: ok([], "mock modules", 1874),
        token: ok({ address: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", symbol: "USDT", decimals: 6, balanceRaw: tr.value.balanceRaw ?? "0" }, "mock USDT", 1874),
        seats: ok(t.ownerAddresses.map((o) => ({ owner: o, isSeat: true })), "mock isSeat", 1874),
        transfers: ok(
          [
            ...tr.value.deposits.filter((d) => d.status === "VERIFIED").map((d) => ({ from: d.from, to: t.safeAddress, valueRaw: d.amountRaw, txHash: d.txHash, blockNumber: "0", direction: "IN" as const })),
            ...tr.value.payments
              .filter((p) => p.status === "EXECUTED" && p.executedTxHash)
              .map((p) => ({ from: t.safeAddress, to: p.recipient, valueRaw: p.amountRaw, txHash: p.executedTxHash!, blockNumber: "0", direction: "OUT" as const })),
          ],
          "mock Transfer logs",
          1874,
        ),
      }
    : {
        blockNumber: pending("mock block", 1874, "Deployment confirming"),
        safeCode: pending("mock getCode", 1874, "Deployment confirming"),
        version: pending("mock VERSION", 1874, "Deployment confirming"),
        owners: pending("mock getOwners", 1874, "Deployment confirming"),
        threshold: pending("mock getThreshold", 1874, "Deployment confirming"),
        guard: pending("mock guard", 1874, "Deployment confirming"),
        binding: pending("mock binding", 1874, "Deployment confirming"),
        codeHashes: pending("mock code", 1874, "Deployment confirming"),
        modules: pending("mock modules", 1874, "Deployment confirming"),
        token: pending("mock USDT", 1874, "Deployment confirming"),
        seats: pending("mock isSeat", 1874, "Deployment confirming"),
        transfers: pending("mock logs", 1874, "Deployment confirming"),
      };
  return report;
}
