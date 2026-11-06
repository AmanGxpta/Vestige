/**
 * DEV MOCK chain report — builds a PublicChainReport from the DEV MOCK store so
 * the public page's layout/states can be tested before real ENS/Whitechain
 * records exist. Every step is marked source DEV_MOCK and the page shows a
 * full-width DEV MOCK banner. Never used unless explicitly requested via
 * `?source=mock` in a non-production build.
 */
import type { VestigeClient } from "@/src/modules/ui/adapter";
import type { PublicChainReport, Provenance, Step } from "./chain-reader";

export async function readMockChainReport(ensName: string, client: VestigeClient): Promise<PublicChainReport> {
  const startedAt = new Date().toISOString();
  const prov = (method: string, chainId: number): Provenance => ({ chainId, method, source: "DEV_MOCK" });
  const pub = await client.getPublicEvidence(ensName);
  if (!pub.ok) {
    const f: Step<never> = { status: "FAILED", note: pub.error.message, provenance: prov("mock lookup", 11155111) };
    return { ensName, startedAt, source: "DEV_MOCK", ens: { resolver: f, treasury: f, texts: f } };
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
          "vestige.status": "workspace",
          "vestige.humans": String(pub.value.humansVerified),
          "vestige.agreement": pub.value.agreement?.docHash ?? null,
          "vestige.guard": t?.guardAddress ?? null,
        },
        "mock text records",
        11155111,
      ),
    },
  };
  if (!t || !tr.ok) return report;
  const live = t.verificationStatus === "VERIFIED";
  report.whitechain = live
    ? {
        blockNumber: ok("0", "mock block", 1874),
        safeCode: ok(true, "mock getCode", 1874),
        version: ok("1.4.1", "mock VERSION", 1874),
        owners: ok(t.ownerAddresses, "mock getOwners", 1874),
        threshold: ok(t.threshold, "mock getThreshold", 1874),
        guard: ok(t.guardAddress, "mock guard slot", 1874),
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
        modules: pending("mock modules", 1874, "Deployment confirming"),
        token: pending("mock USDT", 1874, "Deployment confirming"),
        seats: pending("mock isSeat", 1874, "Deployment confirming"),
        transfers: pending("mock logs", 1874, "Deployment confirming"),
      };
  return report;
}
