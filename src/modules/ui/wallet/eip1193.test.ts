/**
 * Injected-wallet logic against a FAKE EIP-1193 provider (no real wallet, no keys).
 * Proves the switching/refusal rules; a real-wallet smoke test is still required (H).
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { FOUNDING_TERMS_DOMAIN, FOUNDING_TERMS_TYPES } from "../agreement/terms";
import { readChainId, signMessage, signTypedData, switchChain, WalletError, type Eip1193Provider } from "./eip1193";

const RPC = { sepolia: "https://s", whitechain: "https://w", whitechainExplorer: "https://e" };
// Ephemeral key generated per test run; never written anywhere.
const acct = privateKeyToAccount(generatePrivateKey());

function fakeWallet(opts: { chainId?: number; knows?: number[]; reject?: string[]; accounts?: string[] } = {}) {
  let chainId = opts.chainId ?? 11155111;
  const knows = new Set(opts.knows ?? [11155111]);
  const calls: { method: string; params?: unknown }[] = [];
  const p: Eip1193Provider = {
    async request({ method, params }) {
      calls.push({ method, params });
      if (opts.reject?.includes(method)) throw Object.assign(new Error("User rejected"), { code: 4001 });
      switch (method) {
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "eth_accounts":
        case "eth_requestAccounts":
          return opts.accounts ?? [acct.address];
        case "wallet_switchEthereumChain": {
          const id = Number.parseInt((params as [{ chainId: string }])[0].chainId, 16);
          if (!knows.has(id)) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
          chainId = id;
          return null;
        }
        case "wallet_addEthereumChain": {
          const id = Number.parseInt((params as [{ chainId: string }])[0].chainId, 16);
          knows.add(id);
          chainId = id;
          return null;
        }
        case "personal_sign": {
          const [hex] = params as [string];
          return acct.signMessage({ message: { raw: hex as `0x${string}` } });
        }
        case "eth_signTypedData_v4":
          return `0x${"22".repeat(65)}`;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  };
  return { p, calls, chain: () => chainId };
}

describe("explicit network switching", () => {
  it("switches Sepolia → Whitechain, adding Whitechain if the wallet does not know it (4902)", async () => {
    const w = fakeWallet({ chainId: 11155111 });
    expect(await switchChain(w.p, 1874, RPC)).toBe(1874);
    const add = w.calls.find((c) => c.method === "wallet_addEthereumChain")!;
    expect((add.params as [{ chainId: string; rpcUrls: string[] }])[0]).toMatchObject({ chainId: "0x752", rpcUrls: ["https://w"] });
    expect(await readChainId(w.p)).toBe(1874);
  });

  it("a rejected switch is an actionable REJECTED error and the chain is unchanged", async () => {
    const w = fakeWallet({ chainId: 1874, knows: [1874, 11155111], reject: ["wallet_switchEthereumChain"] });
    await expect(switchChain(w.p, 11155111, RPC)).rejects.toMatchObject({ code: "REJECTED" });
    expect(w.chain()).toBe(1874);
  });

  it("refuses chains vestige does not use", async () => {
    const w = fakeWallet();
    await expect(switchChain(w.p, 1, RPC)).rejects.toBeInstanceOf(WalletError);
  });
});

describe("typed-data signing never switches silently", () => {
  const td = {
    domain: FOUNDING_TERMS_DOMAIN,
    types: FOUNDING_TERMS_TYPES,
    primaryType: "FoundingTerms",
    message: { ventureId: `0x${"ab".repeat(32)}`, agreementId: `0x${"cd".repeat(32)}`, version: 1n, docHash: `0x${"ef".repeat(32)}`, nonce: 1n, expiry: 2n },
  } as const;

  it("refuses with WRONG_CHAIN when the wallet is on Whitechain but terms are Sepolia", async () => {
    const w = fakeWallet({ chainId: 1874, knows: [1874, 11155111] });
    await expect(signTypedData(w.p, acct.address, td)).rejects.toMatchObject({ code: "WRONG_CHAIN" });
    expect(w.calls.some((c) => c.method === "eth_signTypedData_v4" || c.method === "wallet_switchEthereumChain")).toBe(false);
  });

  it("refuses when the wallet account changed", async () => {
    const w = fakeWallet({ accounts: ["0x0000000000000000000000000000000000000001"] });
    await expect(signTypedData(w.p, acct.address, td)).rejects.toMatchObject({ code: "WRONG_ACCOUNT" });
  });

  it("on the right chain, passes the exact EIP-712 domain/message to eth_signTypedData_v4", async () => {
    const w = fakeWallet({ chainId: 11155111 });
    expect(await signTypedData(w.p, acct.address, td)).toMatch(/^0x22/);
    const call = w.calls.find((c) => c.method === "eth_signTypedData_v4")!;
    const payload = JSON.parse((call.params as [string, string])[1]);
    expect(payload.domain).toEqual({ name: "vestige", version: "1", chainId: 11155111 });
    expect(payload.primaryType).toBe("FoundingTerms");
    expect(payload.message.version).toBe("1");
  });

  it("user rejection maps to REJECTED", async () => {
    const w = fakeWallet({ reject: ["eth_signTypedData_v4"] });
    await expect(signTypedData(w.p, acct.address, td)).rejects.toMatchObject({ code: "REJECTED" });
  });
});

describe("sign-in message", () => {
  it("personal_sign produces a signature that recovers to the wallet", async () => {
    const w = fakeWallet();
    const msg = "localhost:3200 wants you to sign in with your Ethereum account:\n" + acct.address;
    const sig = await signMessage(w.p, acct.address, msg);
    expect(await verifyMessage({ address: acct.address, message: msg, signature: sig })).toBe(true);
  });
});
