import {createHash} from 'node:crypto';
const numeric={RELAYER_DAILY_WBT_BUDGET_WEI:'dailyBudgetWei',RELAYER_MAX_GAS_LIMIT:'maxGas',RELAYER_MAX_FEE_PER_GAS_WEI:'maxGasPrice',RELAYER_L1_FEE_RESERVE_WEI:'l1FeeReserveWei',RELAYER_MIN_BALANCE_WEI:'minBalanceWei'};
export const limitsDigest=limits=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(limits).sort().map(k=>[k,String(limits[k])])))).digest('hex');
export function relayConfiguration(env){
 const missing=[],limits={};
 for(const [name,key]of Object.entries(numeric)){const s=env[name];if(!/^[1-9][0-9]{0,77}$/.test(s||'')||BigInt(s)>=2n**256n)missing.push(name);else limits[key]=BigInt(s);}
 const rate=env.RELAYER_MAX_PER_MINUTE;if(!/^[1-9][0-9]{0,5}$/.test(rate||''))missing.push('RELAYER_MAX_PER_MINUTE');else limits.maxPerMinute=Number(rate);
 for(const name of ['RELAYER_JOURNAL_PATH','RELAYER_KEYSTORE_PATH','RELAYER_KEYSTORE_NAME','RELAYER_ALERT_WEBHOOK_URL'])if(!env[name]?.trim())missing.push(name);
 if(env.RELAYER_ENABLED!=='true'&&env.RELAYER_ENABLED!=='false'&&env.RELAYER_ENABLED!==undefined)throw new Error('INVALID_RELAYER_ENABLED');
 if(env.RELAYER_ENABLED==='true'&&missing.length)throw new Error('RELAYER_LIMITS_UNCONFIGURED');
 return {enabled:env.RELAYER_ENABLED==='true',limits:missing.length?null:limits,missing,journalPath:env.RELAYER_JOURNAL_PATH,keystorePath:env.RELAYER_KEYSTORE_PATH,keystoreName:env.RELAYER_KEYSTORE_NAME,alertUrl:env.RELAYER_ALERT_WEBHOOK_URL};
}
/** Only sanitized numeric metrics leave the host; no signatures, bodies, bearer tokens or URLs. */
export class AlertHooks {
 constructor(transport){this.transport=transport;}
 async notify(event,values={}){
  if(!this.transport)throw new Error('ALERT_TRANSPORT_FAILED');
  const metrics=Object.fromEntries(Object.entries(values).filter(([k,v])=>/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(k)&&(typeof v==='number'||typeof v==='bigint'||/^\d+$/.test(v)) ).map(([k,v])=>[k,String(v)]));
  try{if(await this.transport({event,metrics})!==true)throw new Error();}catch{throw new Error('ALERT_TRANSPORT_FAILED');}
 }
 async probe(){await this.notify('relay_healthcheck');}
}
export function webhookAlerts(url,fetcher=fetch){
 const endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new Error('INVALID_ALERT_URL');
 return new AlertHooks(async body=>{const r=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.ok;});
}
/** A fee review is injected by H; no env switch or local-fork proof can create a LIVE review. */
export class RelaySafety {
 constructor({review,alerts,roles={},killSwitch=()=>false}){Object.assign(this,{review,alerts,roles,killSwitch});}
 async ready(io,limits,now){
  const r=this.review;if(this.killSwitch())throw new Error('RELAYER_KILL_SWITCH');
  if(!r||r.chainId!==1874||r.limitsDigest!==limitsDigest(limits)||!r.reference||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=now)throw new Error('FEE_POLICY_UNREVIEWED');
  if(r.scope==='LOCAL_FORK_ONLY'){if(!await io.isLocalFork())throw new Error('LOCAL_POLICY_ON_LIVE_RPC');}
  else if(r.scope==='LIVE'){
   if(!r.measurements?.length||!this.roles.deployer||!this.roles.registrar||[this.roles.deployer,this.roles.registrar].some(a=>a.toLowerCase()===io.sender.toLowerCase()))throw new Error('ROLE_OR_FEE_REVIEW_MISSING');
   if(!Number.isSafeInteger(r.marginBps)||r.marginBps<10000||r.measurements.some(m=>!/^\d+$/.test(m.quotedL1FeeWei||'')))throw new Error('FEE_POLICY_UNREVIEWED');
   await io.verifyFeeMeasurements(r.measurements);
   const peak=r.measurements.reduce((peak,m)=>[peak,BigInt(m.quotedL1FeeWei),BigInt(m.l1FeeWei)].reduce((a,b)=>a>b?a:b),0n);
   if((peak*BigInt(r.marginBps)+9999n)/10000n>limits.l1FeeReserveWei)throw new Error('FEE_RESERVE_BELOW_REVIEWED_SAMPLES');
  }else throw new Error('FEE_POLICY_UNREVIEWED');
  if(!this.alerts)throw new Error('ALERT_TRANSPORT_FAILED');
  await this.alerts.probe();
 }
 async beforeSend(now){if(this.killSwitch())throw new Error('RELAYER_KILL_SWITCH');if(!this.review||!Number.isFinite(Date.parse(this.review.expiresAt))||Date.parse(this.review.expiresAt)<=now)throw new Error('FEE_POLICY_UNREVIEWED');}
 async notify(event,metrics){await this.alerts.notify(event,metrics);}
}
