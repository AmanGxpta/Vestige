"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Result, VestigeClient, WorldProofPayload } from "./adapter";
import { ADAPTER_KIND } from "./config";
import { createLiveAdapter } from "./live-adapter";
import { browserStorage, createMockAdapter } from "./mock/mock-adapter";
import type { Address, Hex } from "./types";

/**
 * DEV MOCK roles. Each browser TAB holds its own role (sessionStorage), so the
 * Founder A / Founder B / Funder journeys can run side by side in separate tabs
 * against one shared mock store (localStorage). Addresses are obviously fake.
 */
export const MOCK_ROLES = {
  founderA: { label: "Founder A", address: "0xAaAa000000000000000000000000000000000001" as Address },
  founderB: { label: "Founder B", address: "0xbBbB000000000000000000000000000000000002" as Address },
  founderA2: { label: "Founder A · 2nd wallet", address: "0xAaAa000000000000000000000000000000000005" as Address },
  funder: { label: "Funder", address: "0xFfFF000000000000000000000000000000000003" as Address },
  payee: { label: "Contractor", address: "0xCcCC000000000000000000000000000000000004" as Address },
} as const;
export type MockRole = keyof typeof MOCK_ROLES | "visitor";
const ROLE_KEY = "vestige.devmock.role";

export type SignaturePrompt = {
  /** Plain-language line shown as the wallet prompt title (FR-8). */
  title: string;
  /** What is being signed, in plain words. Never ask for gas, seed phrase or network switch. */
  lines: { label: string; value: string }[];
  /** EIP-712 primary type, shown small for transparency. */
  typedDataName: string;
  costsGas: false;
};
export type WorldPrompt = { ventureName: string; wallet: Address };

type Pending =
  | { kind: "signature"; prompt: SignaturePrompt; address: Address; resolve: (v: Hex | null) => void }
  | { kind: "world"; prompt: WorldPrompt; resolve: (v: WorldProofPayload | null) => void };

type Ctx = {
  client: VestigeClient;
  role: MockRole;
  setRole: (r: MockRole) => void;
  address?: Address;
  /** Opens the wallet prompt. Resolves null if the user cancels. */
  requestSignature: (prompt: SignaturePrompt) => Promise<Hex | null>;
  /** Opens World ID (IDKit in live mode — owned by C1 — or the DEV MOCK simulator). */
  requestWorldProof: (prompt: WorldPrompt) => Promise<WorldProofPayload | null>;
  pending: Pending | null;
  settle: (value: Hex | WorldProofPayload | null) => void;
  resetMock?: () => void;
};

const VestigeContext = createContext<Ctx | null>(null);

export function VestigeProvider({ children }: { children: ReactNode }) {
  const client = useMemo<VestigeClient & { reset?: () => void }>(
    () => (ADAPTER_KIND === "dev-mock" ? createMockAdapter({ storage: browserStorage() }) : createLiveAdapter()),
    [],
  );
  const [role, setRoleState] = useState<MockRole>("visitor");
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(ROLE_KEY) as MockRole | null;
      if (saved && (saved === "visitor" || saved in MOCK_ROLES)) setRoleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setRole = useCallback((r: MockRole) => {
    setRoleState(r);
    try {
      window.sessionStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  const address = ADAPTER_KIND === "dev-mock" && role !== "visitor" ? MOCK_ROLES[role].address : undefined;

  const requestSignature = useCallback(
    (prompt: SignaturePrompt) =>
      new Promise<Hex | null>((resolve) => {
        if (!address) return resolve(null);
        setPending({ kind: "signature", prompt, address, resolve });
      }),
    [address],
  );
  const requestWorldProof = useCallback(
    (prompt: WorldPrompt) => new Promise<WorldProofPayload | null>((resolve) => setPending({ kind: "world", prompt, resolve })),
    [],
  );
  const settle = useCallback(
    (value: Hex | WorldProofPayload | null) => {
      setPending((p) => {
        if (p?.kind === "signature") p.resolve((value as Hex) ?? null);
        if (p?.kind === "world") p.resolve((value as WorldProofPayload) ?? null);
        return null;
      });
    },
    [],
  );

  const value: Ctx = {
    client,
    role,
    setRole,
    address,
    requestSignature,
    requestWorldProof,
    pending,
    settle,
    resetMock: client.reset ? () => client.reset?.() : undefined,
  };
  return <VestigeContext.Provider value={value}>{children}</VestigeContext.Provider>;
}

export function useVestige(): Ctx {
  const ctx = useContext(VestigeContext);
  if (!ctx) throw new Error("useVestige must be used inside <VestigeProvider>");
  return ctx;
}

export type QueryState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ok"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: { code: string; message: string; detail?: string } };

/**
 * Runs an adapter read, re-runs on adapter change events, and optionally polls
 * (used while anything is PENDING so confirmations appear without a reload).
 */
export function useAdapterQuery<T>(
  fn: (client: VestigeClient) => Promise<Result<T>>,
  deps: unknown[],
  opts: { pollMs?: (data: T | undefined) => number | undefined } = {},
): QueryState<T> & { refresh: () => void } {
  const { client } = useVestige();
  const [state, setState] = useState<QueryState<T>>({ status: "loading" });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pollRef = useRef(opts.pollMs);
  pollRef.current = opts.pollMs;
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => client.subscribe(refresh), [client, refresh]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    fnRef.current(client).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setState({ status: "ok", data: r.value });
        const ms = pollRef.current?.(r.value);
        if (ms) timer = setTimeout(refresh, ms);
      } else setState({ status: "error", error: r.error });
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tick, ...deps]);

  return { ...state, refresh };
}
