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
import { keccak256, stringToBytes } from "viem";
import { err, ok, type Result, type VestigeClient, type WalletSignature, type WorldProofPayload } from "../adapter";
import { previewDocHash, canonicalJson, agreementDocument } from "../canonical";
import type {
  Address,
  Agreement,
  AgreementFields,
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
type MockVersion = Agreement & { fields: AgreementFields; createdAt: string };
type MockPayment = Payment & { createdAt: string; executeReadyAt?: number };
type MockDeposit = { from: Address; amountRaw: string; txHash: Hex; readyAt: number };
type MockVenture = {
  ventureId: VentureId;
  slug: string;
  displayName: string;
  ensName: string;
  createdAt: string;
  createdBy: Address;
  invite: { code: string; used: boolean };
  seats: MockSeat[];
  versions: MockVersion[];
  treasury?: Treasury & { readyAt: number };
  deposits: MockDeposit[];
  payments: MockPayment[];
  evidence: (Evidence & { readyAt?: number })[];
};
type MockState = { v: 1; ventures: Record<string, MockVenture> };

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

export function createMockAdapter(opts: { storage?: MockStorage; latencyMs?: number } = {}): VestigeClient & { reset(): void } {
  const storage = opts.storage ?? memoryStorage();
  const latency = opts.latencyMs ?? 450;
  const listeners = new Set<() => void>();
  let cache: MockState | null = null;

  const load = (): MockState => {
    const raw = storage.get();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MockState;
        if (parsed?.v === 1) return (cache = parsed);
      } catch {
        /* fall through to fresh state */
      }
    }
    return (cache = cache ?? { v: 1, ventures: {} });
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
    if (v.treasury) v.treasury.verificationStatus = statusAt(v.treasury.readyAt, t);
    for (const p of v.payments) {
      if (p.executeReadyAt !== undefined && t >= p.executeReadyAt && p.status === "READY") p.status = "EXECUTED";
    }
    for (const e of v.evidence) e.status = e.readyAt === undefined ? "VERIFIED" : statusAt(e.readyAt, t);
  };

  const currentVersion = (v: MockVenture) => v.versions[v.versions.length - 1];

  const toDetail = (v: MockVenture, viewer?: Address): VentureDetail => {
    settle(v);
    const ver = currentVersion(v);
    const isFounderA = sameAddr(viewer, v.createdBy);
    return {
      ventureId: v.ventureId,
      slug: v.slug,
      displayName: v.displayName,
      ensName: v.ensName,
      ensStatus: "VERIFIED",
      createdAt: v.createdAt,
      seats: v.seats.map(({ simulatedHumanId: _h, attestReadyAt: _a, label: _l, verifiedAt: _v, ...seat }) => seat),
      invite: isFounderA ? { ...v.invite } : undefined,
      agreement: ver ? (({ fields: _f, createdAt: _c, ...a }) => a)(ver) : undefined,
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
  const seatOf = (v: MockVenture, w: Address) => v.seats.find((s) => sameAddr(s.wallet, w));

  const client: VestigeClient & { reset(): void } = {
    kind: "dev-mock",

    reset() {
      save({ v: 1, ventures: {} });
    },

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
        invite: { code: randomHex(12).slice(2), used: false },
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

    async joinVenture(ventureId, { inviteCode, founderLabel, wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (seatOf(v, wallet)) return err("WALLET_ALREADY_SEATED", "This wallet already holds a seat in this venture.");
      if (v.invite.used || v.invite.code !== inviteCode) return err("INVITE_INVALID", "This invite link is invalid or has already been used.");
      if (!isValidSlug(founderLabel)) return err("INVALID_INPUT", "Founder label must be 3–32 lowercase letters, digits or hyphens.");
      if (v.seats.some((x) => x.label === founderLabel)) return err("INVALID_INPUT", `${founderLabel}.${v.ensName} is taken.`);
      v.invite.used = true;
      v.seats.push({
        ventureId: v.ventureId,
        wallet,
        label: founderLabel,
        founderSubname: `${founderLabel}.${v.ensName}`,
        worldProofStatus: "UNKNOWN",
        onchainSeatStatus: "UNKNOWN",
      });
      save(s);
      return ok(toDetail(v, wallet));
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
        founders: v.seats.map((x) => ({ founderSubname: x.founderSubname, worldProofStatus: x.worldProofStatus, verifiedAt: x.verifiedAt })),
        agreement: ver
          ? {
              version: ver.version,
              docHash: ver.docHash,
              signaturesForCurrentVersion: ver.signatures.filter((g) => g.version === ver.version && g.docHash === ver.docHash).length,
              requiredSignatures: v.seats.length,
            }
          : undefined,
        evidence: v.evidence.map(({ readyAt: _r, ...e }) => e),
        source: "DEV_MOCK",
      };
      return ok(out);
    },

    async listVentures() {
      await wait();
      const list: VentureSummary[] = Object.values(load().ventures).map((v) => {
        settle(v);
        const ver = currentVersion(v);
        const signed = !!ver && v.seats.length >= 2 && v.seats.every((x) => ver.signatures.some((g) => sameAddr(g.signer, x.wallet) && g.version === ver.version));
        return {
          ventureId: v.ventureId,
          displayName: v.displayName,
          ensName: v.ensName,
          humansVerified: v.seats.filter((x) => x.worldProofStatus === "VERIFIED").length,
          termsSigned: signed,
          treasuryActive: v.treasury?.verificationStatus === "VERIFIED",
          funded: v.treasury ? balanceOf(v) > 0n || v.deposits.length > 0 : false,
          source: "DEV_MOCK",
        };
      });
      return ok(list);
    },

    async createAgreementVersion(ventureId, { fields, wallet }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      if (!seatOf(v, wallet)) return err("NOT_A_FOUNDER", "Only founders of this venture can edit its terms.");
      const version = (currentVersion(v)?.version ?? 0) + 1;
      const { hash } = previewDocHash(v.ventureId, version, fields);
      v.versions.push({
        ventureId: v.ventureId,
        agreementId: `agr-${v.slug}`,
        version,
        canonicalJson: canonicalJson(agreementDocument(v.ventureId, version, fields)),
        docHash: hash,
        nonce: randomHex(16),
        expiry: iso(now() + 7 * 24 * 3600 * 1000),
        signatures: [],
        fields,
        createdAt: iso(),
      });
      addEvidence(v, "AGREEMENT_VERSION", "SELF_REPORTED");
      save(s);
      return ok(toDetail(v, wallet));
    },

    async signAgreement(ventureId, { version, docHash, sig }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      const seat = seatOf(v, sig.signer);
      if (!seat) return err("NOT_A_FOUNDER", "Only founders of this venture can sign its terms.");
      if (seat.worldProofStatus !== "VERIFIED") return err("NOT_VERIFIED", "Verify you are a unique human before signing.");
      const ver = currentVersion(v);
      if (!ver || ver.version !== version || ver.docHash !== docHash)
        return err("NOT_READY", "These terms changed since you opened them. Review the new version before signing.");
      if (ver.signatures.some((g) => sameAddr(g.signer, sig.signer))) return ok(toDetail(v, sig.signer));
      ver.signatures.push({ signer: sig.signer, signature: sig.signature, signedAt: iso(), version, docHash });
      addEvidence(v, "AGREEMENT_SIGNED", "SIGNED");
      save(s);
      return ok(toDetail(v, sig.signer));
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
        readyAt,
      };
      addEvidence(v, "SAFE_DEPLOYED", "CHAIN_VERIFIED", { chainId: WHITECHAIN_CHAIN_ID, txHash: v.treasury.deploymentTxHash, readyAt });
      save(s);
      return ok(toTreasury(v));
    },

    async fundTreasury(ventureId, { amountRaw, sig }: { amountRaw: string; sig: WalletSignature }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      settle(v);
      if (v.treasury?.verificationStatus !== "VERIFIED") return err("NOT_READY", "This venture's treasury is not active yet.");
      if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) return err("INVALID_INPUT", "Enter an amount greater than zero.");
      const d: MockDeposit = { from: sig.signer, amountRaw, txHash: randomHex(32), readyAt: now() + DELAY.deposit };
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
      if (!v.treasury || v.treasury.verificationStatus !== "VERIFIED") return err("NOT_READY", "The treasury is not active yet.");
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

    async signPayment(ventureId, paymentId, { sig }) {
      await wait();
      const s = load();
      const v = getV(s, ventureId);
      if (!v) return err("NOT_FOUND", "No venture with that ID.");
      const p = v.payments.find((x) => x.paymentId === paymentId);
      if (!p || !v.treasury) return err("NOT_FOUND", "No such payment.");
      if (!v.treasury.ownerAddresses.some((o) => sameAddr(o, sig.signer))) return err("NOT_A_FOUNDER", "Only treasury owners can approve payments.");
      if (p.status !== "AWAITING_APPROVALS") return ok(toTreasury(v));
      if (!p.signerWallets.some((w) => sameAddr(w, sig.signer))) {
        p.signerWallets.push(sig.signer);
        addEvidence(v, "PAYMENT_APPROVED", "SIGNED");
      }
      if (p.signerWallets.length >= v.treasury.threshold) p.status = "READY";
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
