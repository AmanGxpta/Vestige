"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TypedDataDefinition } from "viem";
import type { AdapterError, Result, TypedDataSigner, VestigeClient, WorldProofPayload, WorldRequest } from "./adapter";
import { ADAPTER_KIND, CONFIG } from "./config";
import { createLiveAdapter } from "./live-adapter";
import { browserStorage, createMockAdapter } from "./mock/mock-adapter";
import { loadManifest, manifestUrlFor } from "@/src/modules/public-view/manifest";
import type { Address, Hex } from "./types";
import {
  discoverInjectedWallets,
  readChainId,
  requestAccounts,
  signMessage as walletSignMessage,
  switchChain as walletSwitchChain,
  toWalletError,
  type Eip1193Provider,
  type InjectedWallet,
} from "./wallet/eip1193";

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
  /** What is being signed, in plain words. Never asks for gas or a seed phrase. */
  lines: { label: string; value: string }[];
  /** EIP-712 primary type, shown small for transparency. */
  typedDataName: string;
  costsGas: false;
};
export type WorldPrompt = { ventureName: string; wallet: Address; request: WorldRequest };

export type WalletState = {
  /** Live mode only. */
  wallets: InjectedWallet[];
  selected?: InjectedWallet;
  chainId?: number;
  connecting: boolean;
  error?: string;
};

type Pending =
  | { kind: "signature"; prompt: SignaturePrompt; typedData: TypedDataDefinition; address: Address; resolve: (v: Hex | null) => void }
  | { kind: "world"; prompt: WorldPrompt; resolve: (v: WorldProofPayload | null) => void };

type Ctx = {
  client: VestigeClient;
  role: MockRole;
  setRole: (r: MockRole) => void;
  /** Mock role address, or the connected injected-wallet account (live). */
  address?: Address;
  wallet: WalletState;
  /** Live: the wallet holding a signed-in session. Mock: same as address. */
  sessionWallet: Address | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Explicit, user-initiated network switch (CONTRACTS: visible switching). */
  switchChain: (chainId: number) => Promise<AdapterError | null>;
  signIn: () => Promise<Result<unknown>>;
  /** Opens the signature prompt for exact typed data. Resolves null if the user cancels. */
  requestSignature: (prompt: SignaturePrompt, typedData: TypedDataDefinition) => Promise<Hex | null>;
  /** Bind a plain-language prompt to the adapter's typed data. */
  signer: (prompt: SignaturePrompt) => TypedDataSigner;
  /** Opens World ID (IDKit in live mode, the DEV MOCK simulator otherwise). */
  requestWorldProof: (prompt: WorldPrompt) => Promise<WorldProofPayload | null>;
  pending: Pending | null;
  settle: (value: Hex | WorldProofPayload | null) => void;
  /** The provider used by the live signature prompt. */
  eip1193?: Eip1193Provider;
  resetMock?: () => void;
};

const VestigeContext = createContext<Ctx | null>(null);

const RPC = { sepolia: CONFIG.sepoliaRpcUrl, whitechain: CONFIG.whitechainRpcUrl, whitechainExplorer: CONFIG.whitechainExplorerUrl };

export function VestigeProvider({ children }: { children: ReactNode }) {
  const client = useMemo<VestigeClient & { reset?: () => void }>(
    () =>
      ADAPTER_KIND === "dev-mock"
        ? createMockAdapter({ storage: browserStorage() })
        : createLiveAdapter({
            usdtAddress: CONFIG.usdtAddress,
            getManifest: async (ensName) => {
              const m = await loadManifest(manifestUrlFor(CONFIG.manifestUrl, ensName));
              return m.status === "LOADED" ? m.manifest : null;
            },
          }),
    [],
  );
  const [role, setRoleState] = useState<MockRole>("visitor");
  const [pending, setPending] = useState<Pending | null>(null);
  const [wallet, setWallet] = useState<WalletState>({ wallets: [], connecting: false });
  const [account, setAccount] = useState<Address | undefined>();
  const [sessionWallet, setSessionWallet] = useState<Address | null>(null);
  const providerRef = useRef<Eip1193Provider | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(ROLE_KEY) as MockRole | null;
      if (saved && (saved === "visitor" || saved in MOCK_ROLES)) setRoleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => client.subscribe(() => setSessionWallet(client.sessionWallet())), [client]);

  const setRole = useCallback((r: MockRole) => {
    setRoleState(r);
    try {
      window.sessionStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- live wallet --------------------------------------------------------
  const detach = useRef<() => void>(() => {});
  const connect = useCallback(async () => {
    if (ADAPTER_KIND !== "live") return;
    setWallet((w) => ({ ...w, connecting: true, error: undefined }));
    try {
      const found = await discoverInjectedWallets(window);
      if (!found.length) {
        setWallet({ wallets: [], connecting: false, error: "No browser wallet found. Install an EIP-1193 wallet (for example MetaMask) in this browser profile." });
        return;
      }
      const sel = found[0];
      const addr = await requestAccounts(sel.provider);
      const chainId = await readChainId(sel.provider);
      providerRef.current = sel.provider;
      detach.current();
      const onAccounts = (a: unknown) => {
        const list = a as string[];
        // Account change/disconnect clears the session (CONTRACTS auth).
        void client.signOut();
        setAccount(list?.[0] ? (list[0] as Address) : undefined);
      };
      const onChain = (c: unknown) => setWallet((w) => ({ ...w, chainId: Number.parseInt(String(c), 16) }));
      const onDisconnect = () => {
        void client.signOut();
        setAccount(undefined);
      };
      sel.provider.on?.("accountsChanged", onAccounts);
      sel.provider.on?.("chainChanged", onChain);
      sel.provider.on?.("disconnect", onDisconnect);
      detach.current = () => {
        sel.provider.removeListener?.("accountsChanged", onAccounts);
        sel.provider.removeListener?.("chainChanged", onChain);
        sel.provider.removeListener?.("disconnect", onDisconnect);
      };
      setAccount(addr);
      setWallet({ wallets: found, selected: sel, chainId, connecting: false });
    } catch (e) {
      setWallet((w) => ({ ...w, connecting: false, error: toWalletError(e, "connection").message }));
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    await client.signOut();
    detach.current();
    providerRef.current = undefined;
    setAccount(undefined);
    setWallet({ wallets: [], connecting: false });
  }, [client]);

  const switchChain = useCallback(async (chainId: number): Promise<AdapterError | null> => {
    const p = providerRef.current;
    if (!p) return { code: "WALLET", message: "Connect your wallet first." };
    try {
      const now = await walletSwitchChain(p, chainId, RPC);
      setWallet((w) => ({ ...w, chainId: now }));
      return null;
    } catch (e) {
      return { code: "WALLET", message: toWalletError(e, "network switch").message };
    }
  }, []);

  const address = ADAPTER_KIND === "dev-mock" ? (role !== "visitor" ? MOCK_ROLES[role].address : undefined) : account;

  const signIn = useCallback(async (): Promise<Result<unknown>> => {
    const p = providerRef.current;
    if (ADAPTER_KIND !== "live") return { ok: true, value: null };
    if (!p || !account) return { ok: false, error: { code: "WALLET", message: "Connect your wallet first." } };
    return client.signIn(account, async (message) => {
      try {
        return await walletSignMessage(p, account, message);
      } catch (e) {
        const we = toWalletError(e, "sign-in");
        if (we.code === "REJECTED") return null;
        throw we;
      }
    });
  }, [client, account]);

  const requestSignature = useCallback(
    (prompt: SignaturePrompt, typedData: TypedDataDefinition) =>
      new Promise<Hex | null>((resolve) => {
        if (!address) return resolve(null);
        setPending({ kind: "signature", prompt, typedData, address, resolve });
      }),
    [address],
  );
  const signer = useCallback((prompt: SignaturePrompt): TypedDataSigner => (td) => requestSignature(prompt, td), [requestSignature]);
  const requestWorldProof = useCallback(
    (prompt: WorldPrompt) => new Promise<WorldProofPayload | null>((resolve) => setPending({ kind: "world", prompt, resolve })),
    [],
  );
  const settle = useCallback((value: Hex | WorldProofPayload | null) => {
    setPending((p) => {
      if (p?.kind === "signature") p.resolve((value as Hex) ?? null);
      if (p?.kind === "world") p.resolve((value as WorldProofPayload) ?? null);
      return null;
    });
  }, []);

  const value: Ctx = {
    client,
    role,
    setRole,
    address,
    wallet,
    sessionWallet: ADAPTER_KIND === "dev-mock" ? (address ?? null) : sessionWallet,
    connect,
    disconnect,
    switchChain,
    signIn,
    requestSignature,
    signer,
    requestWorldProof,
    pending,
    settle,
    eip1193: providerRef.current,
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
 * Runs an adapter read, re-runs on adapter change events (mock store / session),
 * and optionally polls (used while anything is PENDING).
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
