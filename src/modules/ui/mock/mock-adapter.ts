/**
 * DEV MOCK adapter — an in-browser stand-in for the C1/X backends so the UI can
 * be built and browser-tested before contracts are locked.
 *
 * Rules (MASTER §3, CLAUDE.md):
 *  - Every object it returns carries `source: "DEV_MOCK"`; the UI must render that.
 *  - Mock tx hashes are random bytes. They are never linked to an explorer.
 *  - It is refused in production builds (see `client.ts`).
 *  - It models the *intended* contract behaviour (duplicate-human refusal,
 *    signature reset on re-version, relayer refusal of 1-of-2) so the UI's
 *    negative paths can be exercised. That is UI testing, not protocol proof.
 */
import { keccak256, stringToBytes, type TypedDataDefinition } from "viem";
import { err, ok, type Result, type TypedDataSigner, type VestigeClient, type WorldProofPayload } from "../adapter";
import { FOUNDING_TERMS_DOMAIN, FOUNDING_TERMS_TYPES, previewTerms, type FoundingTermsInput } from "../agreement/terms";
import type {
  Address,
  Agreement,
  Evidence,
  EvidenceKind,
  EvidenceLabel,
  FounderSeat,
  Hex,
  Payment,
  PublicOffchainEvidence,
  ReadStatus,
  Treasury,
  TreasuryState,
  VentureDetail,
  VentureId,
  VentureSummary,
} from "../types";
import { WHITECHAIN_CHAIN_ID, SEPOLIA_CHAIN_ID } from "../types";
import { isAddress, isValidSlug } from "../format";

export const MOCK_STORAGE_KEY = "vestige.devmock.v1";
/** Test USDT on Whitechain Sepolia (PRD header; decimals()=6 read live 2026-11-06). */
const MOCK_TOKEN: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
const TOKEN_DECIMALS = 6;
/** Simulated confirmation delays (ms). Status is derived lazily from timestamps. */
const DELAY = { attest: 2500, deploy: 3500, deposit: 2500, execute: 2500 } as const;

type MockSeat = FounderSeat & { simulatedHumanId?: string; label: string; verifiedAt?: string; attestReadyAt?: number };
type MockVersion = Omit<Agreement, "requiredSigners" | "complete" | "ensStatus"> & { createdAt: string };
type MockPayment = Payment & { createdAt: string; executeReadyAt?: number };
type MockDeposit = { from: Address; amountRaw: string; txHash: Hex; readyAt: number };
type MockVenture = {
  ventureId: VentureId;
  slug: string;
  displayName: string;
  ensName: string;
  createdAt: string;
  createdBy: Address;
  invites: { code: string; used: boolean }[];
  listingOptIn: Address[];
  seats: MockSeat[];
  versions: MockVersion[];
  treasury?: Treasury & { readyAt: number };
  deposits: MockDeposit[];
  payments: MockPayment[];
  evidence: (Evidence & { readyAt?: number })[];
};
type MockState = { v: 2; ventures: Record<string, MockVenture> };

function randomHex(bytes: number): Hex {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return `0x${Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}
const now = () => Date.now();
const iso = (t = now()) => new Date(t).toISOString();
const sameAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const statusAt = (readyAt: number | undefined, t = now()): ReadStatus => (readyAt === undefined || t >= readyAt ? "VERIFIED" : "PENDING");

export type MockStorage = { get(): string | null; set(v: string): void };

const memoryStorage = (): MockStorage => {
  let v: string | null = null;
  return { get: () => v, set: (x) => void (v = x) };
};

export const browserStorage = (): MockStorage =>
  typeof window === "undefined"
    ? memoryStorage()
    : {
        get: () => {
          try {
            return window.localStorage.getItem(MOCK_STORAGE_KEY);
          } catch {
            return null;
          }
        },
        set: (x) => {
          try {
            window.localStorage.setItem(MOCK_STORAGE_KEY, x);
          } catch {
            /* private mode — state lives for this tab only */
          }
        },
      };

export type MockClient = VestigeClient & {
  reset(): void;
  mockAllVentures(): Promise<{ ventureId: VentureId; displayName: string; humansVerified: number }[]>;
};

export function createMockAdapter(opts: { storage?: MockStorage; latencyMs?: number } = {}): MockClient {
  const storage = opts.storage ?? memoryStorage();
  const latency = opts.latencyMs ?? 450;
  const listeners = new Set<() => void>();
  let cache: MockState | null = null;

  const load = (): MockState => {
    const raw = storage.get();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MockState;
        if (parsed?.v === 2) return (cache = parsed);
      } catch {
        /* fall through to fresh state */
      }
    }
    return (cache = cache ?? { v: 2, ventures: {} });
  };
  const save = (s: MockState) => {
    cache = s;
    storage.set(JSON.stringify(s));
    listeners.forEach((l) => l());
  };
  const wait = () => new Promise((r) => setTimeout(r, latency));

  const addEvidence = (v: MockVenture, kind: EvidenceKind, label: EvidenceLabel, extra: Partial<Evidence> & { readyAt?: number } = {}) => {
    v.evidence.push({
      id: randomHex(8),
      ventureId: v.ventureId,
      kind,
      label,
      status: "PENDING",
      source: "DEV_MOCK",
      confirmedAt: iso(),
      ...extra,
    });
  };

  /** Promote anything whose simulated confirmation time has passed. */
  const settle = (v: MockVenture) => {
    const t = now();
    for (const s of v.seats) {
      if (s.attestReadyAt !== undefined) s.onchainSeatStatus = statusAt(s.attestReadyAt, t);
    }
    if (v.treasury) v.treasury.verificationStatus = statusAt(v.treasury.readyAt, t) === "VERIFIED" ? "ACTIVE" : "PENDING";
    for (const p of v.payments) {
      if (p.executeReadyAt !== undefined && t >= p.executeReadyAt && p.status === "READY") p.status = "EXECUTED";
    }
    for (const e of v.evidence) e.status = e.readyAt === undefined ? "VERIFIED" : statusAt(e.readyAt, t);
  };

  const currentVersion = (v: MockVenture) => v.versions[v.versions.length - 1];

  const verifiedWallets = (v: MockVenture) => v.seats.filter((x) => x.worldProofStatus === "VERIFIED").map((x) => x.wallet.toLowerCase() as Address).sort();

  const toAgreement = (v: MockVenture, ver: MockVersion, viewer?: Address): Agreement => {
    const required = verifiedWallets(v);
    const counted = ver.signatures.filter((g) => g.version === ver.version && g.docHash === ver.docHash);
    const isFounder = !!seatOf(v, viewer as Address);
    const { createdAt: _c, canonicalJson, ...a } = ver;
    return {
      ...a,
      ...(isFounder ? { canonicalJson } : {}),
      requiredSigners: required,
      complete: required.length >= 2 && required.every((w) => counted.some((g) => sameAddr(g.signer, w))),
      ensStatus: "UNKNOWN",
    };
  };

  const toDetail = (v: MockVenture, viewer?: Address): VentureDetail => {
    settle(v);
    const ver = currentVersion(v);
    const allIn = v.seats.length >= 2 && v.seats.every((x) => v.listingOptIn.some((w) => sameAddr(w, x.wallet)));
    return {
      ventureId: v.ventureId,
      slug: v.slug,
      displayName: v.displayName,
      ensName: v.ensName,
      ensStatus: "VERIFIED",
      createdAt: v.createdAt,
      seats: v.seats.map(({ simulatedHumanId: _h, attestReadyAt: _a, label: _l, verifiedAt: _v, ...seat }) => seat),
      agreement: ver ? toAgreement(v, ver, viewer) : undefined,
      listing: { listed: allIn, optedIn: [...v.listingOptIn] },
      source: "DEV_MOCK",
    };
  };

  const balanceOf = (v: MockVenture): bigint => {
    const t = now();
    const inflow = v.deposits.filter((d) => t >= d.readyAt).reduce((a, d) => a + BigInt(d.amountRaw), 0n);
    const outflow = v.payments.filter((p) => p.status === "EXECUTED").reduce((a, p) => a + BigInt(p.amountRaw), 0n);
    return inflow - outflow;
  };

  const toTreasury = (v: MockVenture): TreasuryState => {
    settle(v);
    const t = now();
    return {
      treasury: v.treasury ? (({ readyAt: _r, ...tr }) => tr)(v.treasury) : undefined,
      balanceRaw: v.treasury ? balanceOf(v).toString() : undefined,
      tokenDecimals: TOKEN_DECIMALS,
      payments: v.payments.map(({ createdAt: _c, executeReadyAt: _e, ...p }) => p),
      deposits: v.deposits.map((d) => ({ from: d.from, amountRaw: d.amountRaw, txHash: d.txHash, status: statusAt(d.readyAt, t) })),
      source: "DEV_MOCK",
    };
  };

  const getV = (s: MockState, id: VentureId) => s.ventures[id.toLowerCase()];
  function seatOf(v: MockVenture, w: Address) {
    return v.seats.find((s) => sameAddr(s.wallet, w));
  }
  /** Ask the (simulated) wallet to sign real-shaped typed data; null → CANCELLED. */
  const signWith = async (sign: TypedDataSigner, td: TypedDataDefinition) => sign(td);

  const client: MockClient = {
    kind: "dev-mock",

    reset() {
      save({ v: 2, ventures: {} });
    },

    // DEV MOCK roles stand in for wallets; there is no session to sign into.
    sessionWallet: () => null,
    async signIn(wallet) {
      return ok({ wallet, expiresAt: iso(now() + 12 * 3600_000) });
    },
    async signOut() {},

    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === MOCK_STORAGE_KEY) {
          cache = null;
          listener();
        }
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },

    async createVenture({ displayName, slug, founderLabel, wallet }) {
      await wait();
      const s = load();
      if (!displayName.trim()) return err("INVALID_INPUT", "Give the venture a name.");
      if (!isValidSlug(slug)) return err("INVALID_INPUT", "Name must be 3–32 lowercase letters, digits or single hyphens.");
      if (!isValidSlug(founderLabel)) return err("INVALID_INPUT", "Founder label must be 3–32 lowercase letters, digits or hyphens.");
      if (Object.values(s.ventures).some((v) => v.slug === slug)) return err("SLUG_TAKEN", `${slug}.vestige.eth is already taken.`);
      const ventureId = randomHex(32);
      const ensName = `${slug}.vestige.eth`;
      const v: MockVenture = {
        ventureId,
        slug,
        displayName: displayName.trim(),
        ensName,
        createdAt: iso(),
        createdBy: wallet,
        invites: [],
        listingOptIn: [],
        seats: [
          {
            ventureId,
            wallet,
            label: founderLabel,
            founderSubname: `${founderLabel}.${ensName}`,
            worldProofStatus: "UNKNOWN",
            onchainSeatStatus: "UNKNOWN",
          },
        ],
        versions: [],
        deposits: [],
        payments: [],
        evidence: [],
      };
      addEvidence(v, "VENTURE_CREATED", "SELF_REPORTED");
      addEvidence(v, "ENS_REGISTERED", "CHAIN_VERIFIED", { chainId: SEPOLIA_CHAIN_ID, txHash: randomHex(32), readyAt: now() + 1500 });
      s.ventures[ventureId.toLowerCase()] = v;
      save(s);
      return ok(toDetail(v, wallet));
    },

    async getVenture(ventureId, viewer) {
      await wait();
      const v = getV(load(), ventureId);
      return v ? ok(toDetail(v, viewer)) : err("NOT_FOUND", "No venture with that ID.");
    },

    async createInvite(ventureId, { wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (!seatOf(v, wallet)) return err("NOT_A_FOUNDER", "Only this venture's founders can invite.");
      if (v.seats.length >= 2) return err("NOT_READY", "All founder seats are taken.");
      const code = randomHex(18).slice(2);
      v.invites.push({ code, used: false });
      save(s);
      return ok({ inviteCode: code });
    },

    async joinVenture(ventureId, { inviteCode, founderLabel, wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (seatOf(v, wallet)) return err("WALLET_ALREADY_SEATED", "This wallet already holds a seat in this venture.");
      const invite = v.invites.find((i) => i.code === inviteCode && !i.used);
      if (!invite) return err("INVITE_INVALID", "This invite link is invalid or has already been used.");
      if (v.seats.length >= 2) return err("NOT_READY", "All founder seats are taken.");
      if (!isValidSlug(founderLabel)) return err("INVALID_INPUT", "Founder label must be 3–32 lowercase letters, digits or hyphens.");
      if (v.seats.some((x) => x.label === founderLabel)) return err("INVALID_INPUT", `${founderLabel}.${v.ensName} is taken.`);
      invite.used = true;
      v.seats.push({
        ventureId: v.ventureId,
        wallet,
        label: founderLabel,
        founderSubname: `${founderLabel}.${v.ensName}`,
        worldProofStatus: "UNKNOWN",
        onchainSeatStatus: "UNKNOWN",
      });
      addEvidence(v, "FOUNDER_JOINED", "SELF_REPORTED");
      save(s);
      return ok(toDetail(v, wallet));
    },

    async requestWorld(ventureId, { wallet }) {
      await wait();
      const v = getV(load(), ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (!seatOf(v, wallet)) return err("NOT_A_FOUNDER", "This wallet does not hold a pending seat in this venture.");
      return ok({ kind: "dev-mock" as const });
    },

    async verifyWorld(ventureId, { wallet, proof }: { wallet: Address; proof: WorldProofPayload }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      const seat = seatOf(v, wallet);
      if (!seat) return err("NOT_A_FOUNDER", "This wallet does not hold a pending seat in this venture.");
      if (proof.kind !== "dev-mock") return err("BLOCKED", "Real IDKit proofs go to C1's endpoint; DEV MOCK cannot verify them.");
      if (seat.worldProofStatus === "VERIFIED") return ok(toDetail(v, wallet));
      const dup = v.seats.find((x) => x !== seat && x.simulatedHumanId === proof.simulatedHumanId);
      if (dup) {
        seat.worldProofStatus = "FAILED";
        addEvidence(v, "DUPLICATE_REFUSED", "HUMAN_VERIFIED");
        save(s);
        return err("DUPLICATE_HUMAN", `This human already holds a seat in ${v.displayName}.`);
      }
      seat.simulatedHumanId = proof.simulatedHumanId;
      seat.worldProofStatus = "VERIFIED";
      seat.verifiedAt = iso();
      seat.onchainSeatStatus = "PENDING";
      seat.attestReadyAt = now() + DELAY.attest;
      seat.attestationTxHash = randomHex(32);
      addEvidence(v, "FOUNDER_VERIFIED", "HUMAN_VERIFIED");
      addEvidence(v, "SEAT_ATTESTED", "CHAIN_VERIFIED", { chainId: WHITECHAIN_CHAIN_ID, txHash: seat.attestationTxHash, readyAt: seat.attestReadyAt });
      save(s);
      return ok(toDetail(v, wallet));
    },

    async getPublicEvidence(ensName) {
      await wait();
      const v = Object.values(load().ventures).find((x) => x.ensName === ensName.toLowerCase());
      if (!v) return err("NOT_FOUND", `${ensName} is not a known vestige venture.`);
      settle(v);
      const ver = currentVersion(v);
      const out: PublicOffchainEvidence = {
        ensName: v.ensName,
        ventureId: v.ventureId,
        humansVerified: v.seats.filter((x) => x.worldProofStatus === "VERIFIED").length,
        founders: v.seats.map((x) => ({
          founderSubname: x.founderSubname,
          wallet: x.wallet,
          worldProofStatus: x.worldProofStatus,
          onchainSeatStatus: x.onchainSeatStatus,
          verifiedAt: x.verifiedAt,
        })),
        agreement: ver
          ? (() => {
              const a = toAgreement(v, ver);
              return {
                version: a.version,
                docHash: a.docHash,
                signaturesForCurrentVersion: a.signatures.filter((g) => g.version === a.version && g.docHash === a.docHash).length,
                requiredSignatures: Math.max(a.requiredSigners.length, 2),
                complete: a.complete,
                ensRecordStatus: a.ensStatus,
              };
            })()
          : undefined,
        evidence: v.evidence.map(({ readyAt: _r, ...e }) => e),
        source: "DEV_MOCK",
      };
      return ok(out);
    },

    async listVentures() {
      await wait();
      const t = iso();
      const list: VentureSummary[] = Object.values(load().ventures)
        .filter((v) => v.seats.length >= 2 && v.seats.every((x) => v.listingOptIn.some((w) => sameAddr(w, x.wallet))))
        .map((v) => {
          settle(v);
          const ver = currentVersion(v);
          return {
            ventureId: v.ventureId,
            displayName: v.displayName,
            ensName: v.ensName,
            humansVerified: v.seats.filter((x) => x.worldProofStatus === "VERIFIED").length,
            termsSigned: !!ver && toAgreement(v, ver).complete,
            treasuryActive: v.treasury ? v.treasury.verificationStatus === "ACTIVE" : false,
            funded: v.treasury ? v.deposits.some((d) => now() >= d.readyAt) : false,
            observedAt: t,
            verificationStatus: "UNKNOWN" as const,
            source: "DEV_MOCK" as const,
          };
        });
      return ok(list);
    },

    /** DEV MOCK only (not a contract route): every venture in this browser, for the founder sidebar. */
    async mockAllVentures() {
      return Object.values(load().ventures).map((v) => ({ ventureId: v.ventureId, displayName: v.displayName, humansVerified: v.seats.filter((x) => x.worldProofStatus === "VERIFIED").length }));
    },

    async setListing(ventureId, { listed, wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (!seatOf(v, wallet)) return err("NOT_A_FOUNDER", "Only this venture's founders can change its listing.");
      v.listingOptIn = v.listingOptIn.filter((w) => !sameAddr(w, wallet));
      if (listed) v.listingOptIn.push(wallet);
      save(s);
      return ok(toDetail(v, wallet));
    },

    async createAgreementVersion(ventureId, { terms, wallet }: { terms: FoundingTermsInput; wallet: Address }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      const seat = seatOf(v, wallet);
      if (!seat) return err("NOT_A_FOUNDER", "Only founders of this venture can edit its terms.");
      if (seat.worldProofStatus !== "VERIFIED") return err("NOT_VERIFIED", "Verify with World ID before working on the agreement.");
      const founders = verifiedWallets(v);
      if (founders.length < 2) return err("NOT_READY", "Both founders must be verified before drafting terms.");
      const p = previewTerms(v.ventureId, founders, terms);
      if (!p.ok) return err("INVALID_INPUT", p.problems[0].message);
      const cur = currentVersion(v);
      if (cur && cur.docHash === p.hash) return err("INVALID_INPUT", "No changes from the current version.");
      v.versions.push({
        ventureId: v.ventureId,
        agreementId: cur?.agreementId ?? randomHex(32),
        version: (cur?.version ?? 0) + 1,
        canonicalJson: p.json,
        docHash: p.hash,
        signatures: [],
        createdAt: iso(),
      });
      addEvidence(v, "AGREEMENT_VERSION", "SELF_REPORTED");
      save(s);
      return ok(toDetail(v, wallet));
    },

    async signAgreement(ventureId, { version, docHash, wallet }, sign) {
      await wait();
      const v0 = getV(load(), ventureId);
      if (!v0) return err("NOT_FOUND", "No venture with that ID.");
      const seat = seatOf(v0, wallet);
      if (!seat) return err("NOT_A_FOUNDER", "Only founders of this venture can sign its terms.");
      if (seat.worldProofStatus !== "VERIFIED") return err("NOT_VERIFIED", "Verify you are a unique human before signing.");
      const ver0 = currentVersion(v0);
      if (!ver0 || ver0.version !== version || ver0.docHash !== docHash)
        return err("VERSION_SUPERSEDED", "These terms changed since you opened them. Review the new version before signing.");
      // Same EIP-712 domain/type as C1; nonce/expiry are simulated.
      const signature = await signWith(sign, {
        domain: FOUNDING_TERMS_DOMAIN,
        types: FOUNDING_TERMS_TYPES,
        primaryType: "FoundingTerms",
        message: {
          ventureId: v0.ventureId,
          agreementId: ver0.agreementId,
          version: BigInt(version),
          docHash,
          nonce: BigInt(randomHex(8)),
          expiry: BigInt(Math.floor(now() / 1000) + 3600),
        },
      });
      if (!signature) return err("CANCELLED", "Signature cancelled. Nothing was signed.");
      const s = load();
      const v = getV(s, ventureId)!;
      const ver = currentVersion(v);
      if (!ver || ver.version !== version || ver.docHash !== docHash) return err("VERSION_SUPERSEDED", "Terms changed while signing. Sign the new version.");
      if (ver.signatures.some((g) => sameAddr(g.signer, wallet))) return ok(toDetail(v, wallet));
      ver.signatures.push({ signer: wallet, signature, signedAt: iso(), version, docHash });
      addEvidence(v, "AGREEMENT_SIGNED", "SIGNED");
      save(s);
      return ok(toDetail(v, wallet));
    },

    async getTreasury(ventureId) {
      await wait();
      const v = getV(load(), ventureId);
      return v ? ok(toTreasury(v)) : err("NOT_FOUND", "No venture with that ID.");
    },

    async deployTreasury(ventureId, { wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      settle(v);
      if (!seatOf(v, wallet)) return err("NOT_A_FOUNDER", "Only founders can set up the treasury.");
      if (v.treasury) return ok(toTreasury(v));
      const ready = v.seats.filter((x) => x.worldProofStatus === "VERIFIED" && x.onchainSeatStatus === "VERIFIED");
      if (ready.length < 2) return err("NOT_READY", "Both founders must be verified humans with seats attested on Whitechain first.");
      const readyAt = now() + DELAY.deploy;
      v.treasury = {
        ventureId: v.ventureId,
        safeAddress: randomHex(20) as Address,
        chainId: WHITECHAIN_CHAIN_ID,
        ownerAddresses: ready.map((x) => x.wallet),
        threshold: 2,
        guardAddress: randomHex(20) as Address,
        registryAddress: randomHex(20) as Address,
        verificationStatus: "PENDING",
        deploymentTxHash: randomHex(32),
        deploymentBlock: "0",
        readyAt,
      };
      addEvidence(v, "SAFE_DEPLOYED", "CHAIN_VERIFIED", { chainId: WHITECHAIN_CHAIN_ID, txHash: v.treasury.deploymentTxHash, readyAt });
      save(s);
      return ok(toTreasury(v));
    },

    async fundTreasury(ventureId, { from, to, amountRaw }, sign) {
      await wait();
      const v0 = getV(load(), ventureId);
      if (!v0) return err("NOT_FOUND", "No venture with that ID.");
      settle(v0);
      if (v0.treasury?.verificationStatus !== "ACTIVE") return err("NOT_READY", "This venture's treasury is not active yet.");
      if (!sameAddr(to, v0.treasury.safeAddress)) return err("INVALID_INPUT", "The destination does not match this venture's treasury.");
      if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) return err("INVALID_INPUT", "Enter an amount greater than zero.");
      // Real EIP-3009 shape on the approved token domain; values simulated.
      const signature = await signWith(sign, {
        domain: { name: "Tether USD", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: MOCK_TOKEN },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: { from, to, value: BigInt(amountRaw), validAfter: 0n, validBefore: BigInt(Math.floor(now() / 1000) + 3600), nonce: randomHex(32) },
      });
      if (!signature) return err("CANCELLED", "Signature cancelled. No money moved.");
      const s = load();
      const v = getV(s, ventureId)!;
      const d: MockDeposit = { from, amountRaw, txHash: randomHex(32), readyAt: now() + DELAY.deposit };
      v.deposits.push(d);
      addEvidence(v, "DEPOSIT", "CHAIN_VERIFIED", { chainId: WHITECHAIN_CHAIN_ID, txHash: d.txHash, readyAt: d.readyAt });
      save(s);
      return ok(toTreasury(v));
    },

    async proposePayment(ventureId, { recipient, amountRaw, reason, wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      settle(v);
      if (!v.treasury || v.treasury.verificationStatus !== "ACTIVE") return err("NOT_READY", "The treasury is not active yet.");
      if (!v.treasury.ownerAddresses.some((o) => sameAddr(o, wallet))) return err("NOT_A_FOUNDER", "Only treasury owners can propose payments.");
      if (!isAddress(recipient)) return err("INVALID_INPUT", "Recipient must be a 0x… address.");
      if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) return err("INVALID_INPUT", "Enter an amount greater than zero.");
      if (!reason.trim()) return err("INVALID_INPUT", "Say what the payment is for.");
      const p: MockPayment = {
        paymentId: randomHex(6).slice(2),
        ventureId: v.ventureId,
        safeTxHash: keccak256(stringToBytes(`${v.ventureId}:${recipient}:${amountRaw}:${v.payments.length}`)),
        recipient,
        tokenAddress: MOCK_TOKEN,
        amountRaw,
        reason: reason.trim(),
        signerWallets: [],
        status: "AWAITING_APPROVALS",
        createdAt: iso(),
      };
      v.payments.push(p);
      addEvidence(v, "PAYMENT_PROPOSED", "SELF_REPORTED");
      save(s);
      return ok(toTreasury(v));
    },

    async signPayment(ventureId, paymentId, { wallet }, sign) {
      await wait();
      const v0 = getV(load(), ventureId);
      if (!v0) return err("NOT_FOUND", "No venture with that ID.");
      const p0 = v0.payments.find((x) => x.paymentId === paymentId);
      if (!p0 || !v0.treasury) return err("NOT_FOUND", "No such payment.");
      if (!v0.treasury.ownerAddresses.some((o) => sameAddr(o, wallet))) return err("NOT_A_FOUNDER", "Only treasury owners can approve payments.");
      if (p0.status !== "AWAITING_APPROVALS") return ok(toTreasury(v0));
      // Safe v1.4.1 SafeTx shape (USDT transfer); values simulated.
      const signature = await signWith(sign, {
        domain: { chainId: WHITECHAIN_CHAIN_ID, verifyingContract: v0.treasury.safeAddress },
        types: {
          SafeTx: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "operation", type: "uint8" },
            { name: "safeTxGas", type: "uint256" },
            { name: "baseGas", type: "uint256" },
            { name: "gasPrice", type: "uint256" },
            { name: "gasToken", type: "address" },
            { name: "refundReceiver", type: "address" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "SafeTx",
        message: {
          to: MOCK_TOKEN,
          value: 0n,
          data: "0x",
          operation: 0,
          safeTxGas: 0n,
          baseGas: 0n,
          gasPrice: 0n,
          gasToken: "0x0000000000000000000000000000000000000000",
          refundReceiver: "0x0000000000000000000000000000000000000000",
          nonce: BigInt(v0.payments.indexOf(p0)),
        },
      });
      if (!signature) return err("CANCELLED", "Approval cancelled. Nothing was signed.");
      const s = load();
      const v = getV(s, ventureId)!;
      const p = v.payments.find((x) => x.paymentId === paymentId)!;
      if (!p.signerWallets.some((w) => sameAddr(w, wallet))) {
        p.signerWallets.push(wallet);
        addEvidence(v, "PAYMENT_APPROVED", "SIGNED");
      }
      if (p.signerWallets.length >= (v.treasury?.threshold ?? 2)) p.status = "READY";
      save(s);
      return ok(toTreasury(v));
    },

    async executePayment(ventureId, paymentId, { wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      settle(v);
      const p = v.payments.find((x) => x.paymentId === paymentId);
      if (!p || !v.treasury) return err("NOT_FOUND", "No such payment.");
      if (!v.treasury.ownerAddresses.some((o) => sameAddr(o, wallet))) return err("NOT_A_FOUNDER", "Only treasury owners can request execution.");
      if (p.signerWallets.length < v.treasury.threshold)
        return err(
          "RELAYER_REFUSED",
          `The relayer simulated this payment and the Safe would reject it: ${p.signerWallets.length} of ${v.treasury.threshold} signatures (GS020). Nothing was sent and no gas was spent.`,
          "DEV MOCK: models the relayer's eth_call preflight. The real on-chain GS020 failure is a separate mined tx supplied by X/H.",
        );
      if (balanceOf(v) < BigInt(p.amountRaw))
        return err("RELAYER_REFUSED", "The relayer simulated this payment and it would fail: the treasury balance is too low. Nothing was sent.");
      if (p.status === "READY" && p.executeReadyAt === undefined) {
        p.executedTxHash = randomHex(32);
        p.executeReadyAt = now() + DELAY.execute;
        addEvidence(v, "PAYMENT_EXECUTED", "CHAIN_VERIFIED", { chainId: WHITECHAIN_CHAIN_ID, txHash: p.executedTxHash, readyAt: p.executeReadyAt });
      }
      save(s);
      return ok(toTreasury(v));
    },
  };
  return client;
}

/** Simulated humans for the DEV MOCK World ID prompt. Not real identities. */
export const SIMULATED_HUMANS = [
  { id: "sim-human-1", label: "Simulated human #1" },
  { id: "sim-human-2", label: "Simulated human #2" },
  { id: "sim-human-3", label: "Simulated human #3" },
] as const;

export function mockSignature(): Hex {
  return randomHex(65);
}

export type { Result };
