import { err, type VestigeClient } from "./adapter";

/**
 * LIVE adapter — placeholder until docs/CONTRACTS.md is locked by H.
 *
 * MASTER §3 / CONTRACTS change control: "Do not code against speculative
 * endpoints as if committed." So every method returns `BLOCKED` with the exact
 * route it is waiting on. The UI renders BLOCKED as a disabled state with a
 * reason — never as success. Replace method-by-method as C1/X endpoints land.
 */
const blocked = (route: string) =>
  err("BLOCKED", "Not connected yet", `Waiting for ${route} to be locked in docs/CONTRACTS.md and shipped.`);

export function createLiveAdapter(): VestigeClient {
  return {
    kind: "live",
    subscribe: () => () => {},
    createVenture: async () => blocked("POST /api/identity/ventures (C1)"),
    getVenture: async () => blocked("GET /api/identity/ventures/:id (C1)"),
    joinVenture: async () => blocked("POST /api/identity/ventures/:id/join (C1)"),
    verifyWorld: async () => blocked("POST /api/identity/ventures/:id/world/verify (C1)"),
    getPublicEvidence: async () => blocked("GET /api/identity/public/:ensName (C1)"),
    listVentures: async () => blocked("GET /api/identity/ventures — proposed CR-C2-001"),
    createAgreementVersion: async () => blocked("POST /api/agreements/ventures/:id/versions (C1)"),
    signAgreement: async () => blocked("POST /api/agreements/ventures/:id/sign (C1)"),
    getTreasury: async () => blocked("GET /api/treasury/ventures/:id (X)"),
    deployTreasury: async () => blocked("POST /api/treasury/ventures/:id/deploy (X)"),
    fundTreasury: async () => blocked("POST /api/treasury/ventures/:id/fund (X)"),
    proposePayment: async () => blocked("POST /api/treasury/ventures/:id/payments (X)"),
    signPayment: async () => blocked("POST /api/treasury/ventures/:id/payments/:pid/sign (X)"),
    executePayment: async () => blocked("POST /api/treasury/ventures/:id/payments/:pid/execute (X)"),
  };
}
