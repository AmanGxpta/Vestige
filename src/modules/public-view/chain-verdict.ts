import { CONFIG } from "@/src/modules/ui/config";
import { readPublicChainReport, type PublicChainReport } from "./chain-reader";
import { loadManifest, manifestUrlFor } from "./manifest";
import { deriveTreasuryVerdict, type TreasuryVerdict } from "./verdict";

/** Same independent reads as /v/<name>: ENS on Sepolia + Whitechain, checked against the reviewed manifest. No vestige API. */
export async function readChainVerdict(ensName: string): Promise<{ report: PublicChainReport; verdict: TreasuryVerdict }> {
  const report = await readPublicChainReport(ensName, {
    sepoliaRpcUrl: CONFIG.sepoliaRpcUrl,
    whitechainRpcUrl: CONFIG.whitechainRpcUrl,
    usdtAddress: CONFIG.usdtAddress,
    universalResolver: CONFIG.ensUniversalResolver,
    manifest: loadManifest(manifestUrlFor(CONFIG.manifestUrl, ensName)),
  });
  return { report, verdict: deriveTreasuryVerdict(report) };
}
