/**
 * Injected EIP-1193 EOA wallet through viem only (CONTRACTS v0 / D-011, D-023).
 *
 *  - No wagmi, embedded wallets, passkeys, ERC-1271/6492.
 *  - Network switching is VISIBLE and only requested after a user action:
 *    Sepolia 11155111 for auth + founding terms; Whitechain 1874 for Safe
 *    signatures and EIP-3009 funding. A rejected switch is an actionable error.
 *  - Never asks for a seed phrase; founder keys never leave the wallet.
 *
 * Framework-free so it can be unit-tested with a fake provider.
 */
import { createWalletClient, custom, getAddress, numberToHex, type TypedDataDefinition } from "viem";
import { sepolia } from "viem/chains";
import type { Address, Hex } from "../types";
import { SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID } from "../types";

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export type InjectedWallet = { id: string; name: string; provider: Eip1193Provider; icon?: string };

export type ChainInfo = { id: number; name: string; purpose: string };
export const CHAINS: Record<number, ChainInfo> = {
  [SEPOLIA_CHAIN_ID]: { id: SEPOLIA_CHAIN_ID, name: "Ethereum Sepolia", purpose: "identity, sign-in and founding terms" },
  [WHITECHAIN_CHAIN_ID]: { id: WHITECHAIN_CHAIN_ID, name: "Whitechain Testnet", purpose: "treasury approvals and USDT funding" },
};
export const chainName = (id?: number) => (id && CHAINS[id]?.name) || (id ? `chain ${id}` : "unknown network");

/** wallet_addEthereumChain params; only used if the wallet does not know the chain (4902). */
export function addChainParams(chainId: number, rpc: { sepolia: string; whitechain: string; whitechainExplorer: string }) {
  if (chainId === WHITECHAIN_CHAIN_ID)
    return {
      chainId: numberToHex(WHITECHAIN_CHAIN_ID),
      chainName: "Whitechain Testnet",
      nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
      rpcUrls: [rpc.whitechain],
      blockExplorerUrls: [rpc.whitechainExplorer],
    };
  if (chainId === SEPOLIA_CHAIN_ID)
    return {
      chainId: numberToHex(SEPOLIA_CHAIN_ID),
      chainName: sepolia.name,
      nativeCurrency: sepolia.nativeCurrency,
      rpcUrls: [rpc.sepolia],
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    };
  throw new WalletError("UNSUPPORTED_CHAIN", `vestige only uses Sepolia and Whitechain, not chain ${chainId}.`);
}

export type WalletErrorCode = "NO_WALLET" | "REJECTED" | "UNSUPPORTED_CHAIN" | "WRONG_CHAIN" | "WRONG_ACCOUNT" | "WALLET_ERROR";
export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const rpcCode = (e: unknown): number | undefined => {
  const x = e as { code?: number; cause?: { code?: number }; data?: { originalError?: { code?: number } } };
  return x?.code ?? x?.cause?.code ?? x?.data?.originalError?.code;
};

/** Map provider errors to user-safe messages. 4001 = user rejected (EIP-1193). */
export function toWalletError(e: unknown, action: string): WalletError {
  if (e instanceof WalletError) return e;
  const code = rpcCode(e);
  if (code === 4001) return new WalletError("REJECTED", `You declined the ${action} in your wallet. Nothing changed.`);
  const msg = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  return new WalletError("WALLET_ERROR", `Your wallet could not complete the ${action}: ${msg.split("\n")[0].slice(0, 160)}`);
}

/** EIP-6963 discovery plus the legacy window.ethereum. */
export function discoverInjectedWallets(win: Window & { ethereum?: Eip1193Provider } = window, waitMs = 150): Promise<InjectedWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, InjectedWallet>();
    const onAnnounce = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { info?: { uuid: string; name: string; icon?: string; rdns?: string }; provider?: Eip1193Provider } | undefined;
      if (d?.info?.uuid && d.provider) found.set(d.info.uuid, { id: d.info.rdns ?? d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider });
    };
    win.addEventListener("eip6963:announceProvider", onAnnounce);
    win.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      win.removeEventListener("eip6963:announceProvider", onAnnounce);
      const list = [...found.values()];
      if (!list.length && win.ethereum) list.push({ id: "injected", name: "Browser wallet", provider: win.ethereum });
      resolve(list);
    }, waitMs);
  });
}

export async function requestAccounts(p: Eip1193Provider): Promise<Address> {
  try {
    const accts = (await p.request({ method: "eth_requestAccounts" })) as string[];
    if (!accts?.length) throw new WalletError("NO_WALLET", "Your wallet did not share an account.");
    return getAddress(accts[0]);
  } catch (e) {
    throw toWalletError(e, "connection request");
  }
}

export async function readChainId(p: Eip1193Provider): Promise<number> {
  return Number.parseInt(String(await p.request({ method: "eth_chainId" })), 16);
}

/** Ask the wallet to switch. Only call from a user gesture. Adds Whitechain if unknown. */
export async function switchChain(p: Eip1193Provider, chainId: number, rpc: Parameters<typeof addChainParams>[1]): Promise<number> {
  if (!CHAINS[chainId]) throw new WalletError("UNSUPPORTED_CHAIN", `vestige only uses Sepolia and Whitechain, not chain ${chainId}.`);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(chainId) }] });
  } catch (e) {
    if (rpcCode(e) !== 4902) throw toWalletError(e, `switch to ${chainName(chainId)}`);
    try {
      await p.request({ method: "wallet_addEthereumChain", params: [addChainParams(chainId, rpc)] });
    } catch (e2) {
      throw toWalletError(e2, `add ${chainName(chainId)}`);
    }
  }
  const now = await readChainId(p);
  if (now !== chainId) throw new WalletError("WRONG_CHAIN", `Your wallet is still on ${chainName(now)}. Switch to ${chainName(chainId)} to continue.`);
  return now;
}

/**
 * Sign EIP-712 typed data. Refuses (does not silently switch) when the wallet is on
 * a different chain than the domain — the UI must show an explicit switch first.
 */
export async function signTypedData(p: Eip1193Provider, account: Address, typed: TypedDataDefinition): Promise<Hex> {
  const domainChain = typed.domain && "chainId" in typed.domain ? Number(typed.domain.chainId) : undefined;
  const current = await readChainId(p);
  if (domainChain !== undefined && current !== domainChain)
    throw new WalletError("WRONG_CHAIN", `This signature is for ${chainName(domainChain)}, but your wallet is on ${chainName(current)}.`);
  const accts = (await p.request({ method: "eth_accounts" })) as string[];
  if (!accts?.some((a) => a.toLowerCase() === account.toLowerCase()))
    throw new WalletError("WRONG_ACCOUNT", "The account in your wallet changed. Reconnect before signing.");
  try {
    const wc = createWalletClient({ account, transport: custom(p) });
    return await wc.signTypedData({ ...typed, account } as Parameters<typeof wc.signTypedData>[0]);
  } catch (e) {
    throw toWalletError(e, "signature");
  }
}

/** personal_sign for the EIP-4361-style sign-in challenge (chain-independent). */
export async function signMessage(p: Eip1193Provider, account: Address, message: string): Promise<Hex> {
  try {
    const wc = createWalletClient({ account, transport: custom(p) });
    return await wc.signMessage({ account, message });
  } catch (e) {
    throw toWalletError(e, "sign-in signature");
  }
}
