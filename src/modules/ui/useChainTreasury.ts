"use client";

import { useEffect, useState } from "react";
import { readTreasuryActivity, type TreasuryActivity } from "@/src/modules/public-view/chain-reader";
import { ADAPTER_KIND, CONFIG } from "./config";
import type { Address } from "./types";

export type ChainTreasury = { status: "idle" | "loading" } | { status: "ok"; value: TreasuryActivity } | { status: "error"; error: string };

/** LIVE only: reads the Safe's USDT balance and transfers from Whitechain (never our API). */
export function useChainTreasury(safe?: Address, deploymentBlock?: string, refreshKey = 0): ChainTreasury {
  const [s, setS] = useState<ChainTreasury>({ status: "idle" });
  useEffect(() => {
    if (ADAPTER_KIND !== "live" || !safe) return;
    let alive = true;
    setS({ status: "loading" });
    readTreasuryActivity(safe, { whitechainRpcUrl: CONFIG.whitechainRpcUrl, usdtAddress: CONFIG.usdtAddress, fromBlock: deploymentBlock ? BigInt(deploymentBlock) : undefined })
      .then((value) => alive && setS({ status: "ok", value }))
      .catch((e) => alive && setS({ status: "error", error: e instanceof Error ? e.message.split("\n")[0] : String(e) }));
    return () => {
      alive = false;
    };
  }, [safe, deploymentBlock, refreshKey]);
  return s;
}
