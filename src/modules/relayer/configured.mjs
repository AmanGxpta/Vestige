import {RestrictedRelayer} from './relayer.mjs';
import {FileJournal} from './journal.mjs';
import {relayConfiguration,RelaySafety,webhookAlerts} from './safety.mjs';
/** Does not open/decrypt a keystore. H supplies the separately approved signer callback in RpcIO. */
export function createReviewedRelayer({env,io,manifests=[],token,review,roles,authorizeSend=()=>false,alerts}){
 const c=relayConfiguration(env);
 const transport=alerts||(c.alertUrl?webhookAlerts(c.alertUrl):undefined);
 const safety=new RelaySafety({review,alerts:transport,roles,killSwitch:()=>env.RELAYER_ENABLED!=='true'||authorizeSend()!==true});
 return new RestrictedRelayer({manifests,token,io,journal:c.journalPath?new FileJournal(c.journalPath):undefined,limits:c.limits,
  safety,enabled:c.enabled&&!!review&&authorizeSend()===true});
}
