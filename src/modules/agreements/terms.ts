/**
 * Founding terms template (PRD FR-3) and the EIP-712 typed data founders sign.
 * Domain/type are exactly the PRD's; no verifyingContract (none exists).
 */
import type { Address, Hex, TypedDataDomain } from "viem";
import { ENS_CHAIN_ID } from "../identity/config";
import { fail } from "../identity/errors";
import { canonicalWallet, type Bytes32 } from "../identity/ids";

export const AGREEMENT_SCHEMA = "vestige.founding-terms/1";

export interface FounderTerms {
  wallet: Address;
  role: string;
  contribution: string;
  ownershipBps: number; // basis points; all founders sum to 10000
  vestingIntent: string;
}

export interface FoundingTermsDoc {
  schema: typeof AGREEMENT_SCHEMA;
  ventureId: Bytes32;
  effectiveDate: string; // YYYY-MM-DD
  decisionRule: string;
  founders: FounderTerms[];
  notes: string;
  disclaimer: string;
}

export const LEGAL_DISCLAIMER =
  "Workspace agreement between founders. Not a legal incorporation, not legal advice, and not an equity or token issuance.";

const text = (v: unknown, field: string, max: number): string => {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > max) fail("AGREEMENT_INVALID", `${field} is required (max ${max} characters).`);
  return v.trim();
};

/** Validates client fields and binds them to the venture + its verified founders. */
export function buildTermsDoc(ventureId: Bytes32, verifiedFounders: Address[], input: unknown): FoundingTermsDoc {
  const i = (input ?? {}) as Record<string, unknown>;
  const effectiveDate = text(i.effectiveDate, "effectiveDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`))) {
    fail("AGREEMENT_INVALID", "effectiveDate must be YYYY-MM-DD.");
  }
  if (!Array.isArray(i.founders) || i.founders.length !== verifiedFounders.length) {
    fail("AGREEMENT_INVALID", "Terms must cover exactly the venture's verified founders.");
  }
  const founders = (i.founders as unknown[]).map((f): FounderTerms => {
    const o = (f ?? {}) as Record<string, unknown>;
    const bps = o.ownershipBps;
    if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > 10_000) fail("AGREEMENT_INVALID", "ownershipBps must be an integer 0–10000.");
    return {
      wallet: canonicalWallet(o.wallet),
      role: text(o.role, "role", 120),
      contribution: text(o.contribution, "contribution", 1000),
      ownershipBps: bps,
      vestingIntent: text(o.vestingIntent, "vestingIntent", 500),
    };
  });
  const wallets = new Set(founders.map((f) => f.wallet));
  if (wallets.size !== founders.length || verifiedFounders.some((w) => !wallets.has(w))) {
    fail("AGREEMENT_INVALID", "Terms must name each verified founder exactly once.");
  }
  if (founders.reduce((a, f) => a + f.ownershipBps, 0) !== 10_000) fail("AGREEMENT_INVALID", "Proposed ownership must total 100% (10000 bps).");
  founders.sort((a, b) => (a.wallet < b.wallet ? -1 : 1));
  return {
    schema: AGREEMENT_SCHEMA,
    ventureId,
    effectiveDate,
    decisionRule: text(i.decisionRule, "decisionRule", 500),
    founders,
    notes: typeof i.notes === "string" ? i.notes.slice(0, 2000) : "",
    disclaimer: LEGAL_DISCLAIMER,
  };
}

export const FOUNDING_TERMS_DOMAIN = { name: "vestige", version: "1", chainId: ENS_CHAIN_ID } as const satisfies TypedDataDomain;

export const FOUNDING_TERMS_TYPES = {
  FoundingTerms: [
    { name: "ventureId", type: "bytes32" },
    { name: "agreementId", type: "bytes32" },
    { name: "version", type: "uint256" },
    { name: "docHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export interface FoundingTermsMessage {
  ventureId: Bytes32;
  agreementId: Bytes32;
  version: bigint;
  docHash: Hex;
  nonce: bigint;
  expiry: bigint; // unix seconds
}

/** What C2 passes to wallet.signTypedData (bigints as decimal strings over JSON). */
export function typedDataFor(m: FoundingTermsMessage) {
  return { domain: FOUNDING_TERMS_DOMAIN, types: FOUNDING_TERMS_TYPES, primaryType: "FoundingTerms" as const, message: m };
}
