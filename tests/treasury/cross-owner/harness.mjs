import {createRootComposition} from '../../../src/modules/treasury/root-composition.mjs';
import {TreasuryService} from '../../../src/modules/treasury/service.mjs';
import {treasuryReadV1,paymentCreatedV1} from '../../../src/modules/treasury/readback-payload.mjs';
import {createTreasuryHandlers} from '../../../src/modules/treasury/http.mjs';
import {fixture} from '../fixtures.mjs';
import {manifestFixture,a,b} from '../service-fixtures.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base='http://localhost:3200';
class CandidateService extends TreasuryService {
 read(id,actor){return treasuryReadV1(this,id,actor);}
 async mutate(action,input){const value=await super.mutate(action,input);return action==='payments'?paymentCreatedV1(value):value;}
}
export async function harness(modules,product,{draft=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'vestige-cross-owner-'));
 const env={VESTIGE_DB_PATH:join(dir,'app.sqlite'),VESTIGE_AUTH_DOMAIN:'localhost:3200',VESTIGE_AUTH_URI:base,WHITECHAIN_RPC_URL:'http://127.0.0.1:8545',RELAYER_ENABLED:'false'};
 const root=createRootComposition({identityModule:modules.identity,env});const composed=await root.ready();
 const identityHandlers=modules.identity.handlers(composed.identity);const f=fixture(),m=manifestFixture();
 const Service=draft?CandidateService:TreasuryService;
 const service=new Service({store:composed.store,relay:f.relay,manifests:[m]});service.authenticate=composed.treasury.authenticate;
 const handlers=createTreasuryHandlers(service,{authURI:base});const calls=[];
 const fetchImpl=async(input,init={})=>{
  const url=new URL(String(input),base),method=init.method||'GET',headers=new Headers(init.headers);
  // A browser adds Origin for these same-origin POSTs. No bearer/idem headers are synthesized.
  if(method!=='GET')headers.set('origin',base);
  const req=new Request(url,{...init,method,headers});calls.push({method,path:url.pathname,hasBearer:headers.has('authorization'),hasIdempotency:headers.has('idempotency-key')});
  if(url.pathname==='/api/identity/auth/challenge')return identityHandlers.authChallenge(req);
  if(url.pathname==='/api/identity/auth/session')return method==='DELETE'?identityHandlers.authLogout(req):identityHandlers.authSession(req);
  if(url.pathname==='/api/identity/ventures')return method==='POST'?identityHandlers.createVenture(req):identityHandlers.listVentures(req);
  const identity=/^\/api\/identity\/ventures\/([^/]+)(?:\/(invites|join|listing))?$/.exec(url.pathname);
  if(identity){const [,id,action]=identity;if(action==='invites')return identityHandlers.createInvite(req,id);if(action==='join')return identityHandlers.join(req,id);if(action==='listing')return identityHandlers.setListing(req,id);return identityHandlers.getVenture(req,id);}
  const match=/^\/api\/treasury\/ventures\/([^/]+)(?:\/(deploy|fund|payments)(?:\/([^/]+)\/(sign|execute))?)?$/.exec(url.pathname);
  if(match){const [,id,kind,pid,action]=match;const response=await handlers.handle(req,action||kind||'read',{id,pid});
   if(method==='POST'&&kind==='payments'&&!pid)calls.at(-1).responseKeys=Object.keys(await response.clone().json());
   return response;}
  return new Response('unmapped',{status:404});
 };
 const make=()=>product.createLiveAdapter({baseUrl:base,fetchImpl,getManifest:async()=>m});
 const ca=make(),cb=make();const loginA=await ca.signIn(a.address,message=>a.signMessage({message}));const loginB=await cb.signIn(b.address,message=>b.signMessage({message}));
 if(!loginA.ok||!loginB.ok)throw new Error('C1_AUTH_HARNESS_FAILED');
 const created=await ca.createVenture({displayName:'Cross owner fixture',slug:'cross-owner',founderLabel:'alpha',wallet:a.address});if(!created.ok)throw new Error('C1_CREATE_HARNESS_FAILED:'+created.error.code+':'+created.error.detail);
 const id=created.value.ventureId,invite=await ca.createInvite(id,{wallet:a.address});if(!invite.ok)throw new Error('C1_INVITE_HARNESS_FAILED');
 const joined=await cb.joinVenture(id,{inviteCode:invite.value.inviteCode,founderLabel:'bravo',wallet:b.address});if(!joined.ok)throw new Error('C1_JOIN_HARNESS_FAILED');
 const db=composed.identity.db;
 // Stage-labelled port fixtures only; no World portal/simulator success is claimed.
 db.run("UPDATE identity_seats SET world_status='VERIFIED',onchain_status='VERIFIED' WHERE venture_id=?",id);
 for(const [i,acct]of [a,b].entries())db.run('INSERT INTO identity_world_nullifiers VALUES(?,?,?,?,?,?,?)',id,'vestige-founder-seat:'+id,String(i+1),acct.address.toLowerCase(),'4.0','staging',Date.now());
 m.ventureId=id;m.ensName=created.value.ensName;f.chain.blockNumber=10n;f.chain.blockHash='0x'+'66'.repeat(32);m.contracts.safe.address=f.manifest.safe;m.contracts.guard.address=f.manifest.guard;m.contracts.registry.address=f.manifest.registry;
 f.manifest.ventureId=id;f.manifest.singleton=m.contracts.singleton.address;f.chain.ventureId=id;f.chain.singleton=f.manifest.singleton;
 f.relay.manifests=new Map([[id,f.manifest]]);f.token.address=m.contracts.token.address;f.token.domain=m.contracts.token.eip712Domain;
 f.relay.now=()=>Math.floor(Date.now()/1000);f.io.quoteL1=async()=>({l1Fee:1n,blockNumber:10n,blockHash:'0x'+'66'.repeat(32),at:Math.floor(Date.now()/1000)*1000});
 service.readPort={read:async()=>({balanceRaw:'0',tokenDecimals:6,depositsStatus:'VERIFIED',deposits:[],evidence:[]})};
 return {ca,cb,id,service,composed,root,db,f,calls,manifest:m,close:async()=>{composed.identity.db.raw.close();await rm(dir,{recursive:true,force:true});}};
}
