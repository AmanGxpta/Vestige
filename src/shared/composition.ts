import { createRootComposition } from "../modules/treasury/root-composition.mjs";
import { TreasurySummaryPort } from "../modules/treasury/summary-port.mjs";
import { getIdentityServices, registerSeatAttester, registerTreasurySummary } from "../modules/identity/container";
import type { TreasurySummaryPort as Summary } from "../modules/identity/ports";
let summary: Summary | undefined;
const root = createRootComposition({
  identityModule: { registerSeatAttester, getIdentityServices(env) {
    registerTreasurySummary({ summary: id => summary ? summary.summary(id) : Promise.resolve({treasuryActive:null,funded:null,observedAt:new Date().toISOString(),source:"UNKNOWN",verificationStatus:"UNKNOWN"}) });
    return getIdentityServices(env as NodeJS.ProcessEnv);
  } }, env: process.env, readbackVersion: 1,
});
let ready: ReturnType<typeof root.ready> | undefined;
export function services() {
  return ready ??= root.ready().then(result => {
    summary = new TreasurySummaryPort({service: result.treasury as ConstructorParameters<typeof TreasurySummaryPort>[0]["service"], client: result.client});
    return result;
  });
}
