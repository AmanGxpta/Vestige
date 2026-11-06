"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAdapterQuery, useVestige, type QueryState } from "../provider";
import { hasPending } from "../progress";
import type { TreasuryState, VentureDetail, VentureId } from "../types";

type VentureCtx = {
  ventureId: VentureId;
  venture: QueryState<VentureDetail> & { refresh: () => void };
  treasury: QueryState<TreasuryState> & { refresh: () => void };
  refreshAll: () => void;
};
const Ctx = createContext<VentureCtx | null>(null);

export function VentureProvider({ ventureId, children }: { ventureId: VentureId; children: ReactNode }) {
  const { address } = useVestige();
  const treasury = useAdapterQuery((c) => c.getTreasury(ventureId), [ventureId], {
    pollMs: (t) => (hasPending(undefined, t) ? 1200 : undefined),
  });
  const venture = useAdapterQuery((c) => c.getVenture(ventureId, address), [ventureId, address], {
    pollMs: (v) => (hasPending(v, undefined) ? 1200 : undefined),
  });
  const refreshAll = () => {
    venture.refresh();
    treasury.refresh();
  };
  return <Ctx.Provider value={{ ventureId, venture, treasury, refreshAll }}>{children}</Ctx.Provider>;
}

export function useVenture(): VentureCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVenture outside VentureProvider");
  return c;
}
