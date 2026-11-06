import test from 'node:test';
import assert from 'node:assert/strict';
import {createTreasuryHandlers} from '../../src/modules/treasury/http.mjs';
import {sqlFixture,ventureId} from './service-fixtures.mjs';
test('treasury mutations require the server-resolved bearer session',async()=>{
 const f=sqlFixture();try{
  const h=createTreasuryHandlers({store:f.store},{authURI:'http://localhost:3200'});
  const res=await h.handle(new Request('http://localhost:3200/api/treasury',{method:'POST',body:'{}'}),'deploy',{id:ventureId});
  assert.equal(res.status,401);
 }finally{f.close();}
});
import {TreasuryService} from '../../src/modules/treasury/service.mjs';
import {fixture} from './fixtures.mjs';
import {a,b,addr} from './service-fixtures.mjs';
function setup(){const f=sqlFixture(),chain=fixture();const service=new TreasuryService({store:f.store,relay:chain.relay,manifests:[],readConfirmedSeats:async()=>true});
 const handlers=createTreasuryHandlers(service,{authURI:'http://localhost:3200'});
 const request=(body={},key='abcdefgh',token=f.token,origin='http://localhost:3200')=>new Request('http://localhost:3200/api/treasury',{method:'POST',headers:{authorization:'Bearer '+token,origin,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
 return {...f,...chain,service,handlers,request,close:f.close,authToken:f.token};}
test('stored server proposal, owner signatures and idempotency preserve payment authority',async()=>{
 const f=setup();try{
  const payload={recipient:addr(600),amountRaw:'500000',reason:'local test'};
  const created=await f.handlers.handle(f.request(payload),'payments',{id:ventureId});assert.equal(created.status,200);const p=await created.json();assert.equal(p.status,'AWAITING_APPROVALS');
  const replay=await (await f.handlers.handle(f.request(payload),'payments',{id:ventureId})).json();assert.equal(replay.paymentId,p.paymentId);
  const conflict=await f.handlers.handle(f.request({...payload,amountRaw:'500001'}),'payments',{id:ventureId});assert.equal(conflict.status,409);
  const signature=await a.signTypedData(p.typedData);
  const signed=await (await f.handlers.handle(f.request({signature},'signature-a'),'sign',{id:ventureId,pid:p.paymentId})).json();assert.equal(signed.signerWallets.length,1);
  const one=await f.handlers.handle(f.request({},'execution-a'),'execute',{id:ventureId,pid:p.paymentId});assert.equal(one.status,409);assert.equal(f.sends.length,0);
 }finally{f.close();}
});
test('origin, payer/session mismatch, stale tokens, invalid body and oversized body fail closed',async()=>{
 const f=setup();try{
  assert.equal((await f.handlers.handle(f.request({},'abcdefgh',f.authToken,'https://attacker.invalid'),'deploy',{id:ventureId})).status,403);
  assert.equal((await f.handlers.handle(f.request({},'abcdefgh','nonexistent-session-token-value'),'deploy',{id:ventureId})).status,401);
  const req=await f.fund();const funding=Object.fromEntries(Object.entries(req).filter(([k])=>k!=='ventureId').map(([k,v])=>[k,typeof v==='bigint'?String(v):v]));funding.from=b.address;
  assert.equal((await f.handlers.handle(f.request(funding,'fundwrong'),'fund',{id:ventureId})).status,403);
  assert.equal((await f.handlers.handle(f.request({reason:'x'.repeat(20000)},'toolarge1'),'payments',{id:ventureId})).status,413);
  assert.equal(f.sends.length,0);
 }finally{f.close();}
});
test('staging seats prepare only; no transport or real-human claim is exposed',async()=>{
 const f=setup();try{
  f.db.run("UPDATE identity_world_nullifiers SET environment='staging'");
  const res=await f.handlers.handle(f.request(),'deploy',{id:ventureId});const out=await res.json();
  assert.equal(res.status,202);assert.equal(out.error.code,'HUMAN_APPROVAL_REQUIRED');assert.equal(f.sends.length,0);
  assert.equal(f.store.operations(ventureId)[0].source,'TESTED_IN_SIMULATOR');
 }finally{f.close();}
});
import {createHash} from 'node:crypto';
test('two authenticated owners sign the stored proposal and a stale nonce clears approvals',async()=>{
 const f=setup();try{
  const p=await (await f.handlers.handle(f.request({recipient:addr(600),amountRaw:'500000',reason:'local test'}),'payments',{id:ventureId})).json();
  const tokenB='local-test-bearer-for-owner-b-only';f.db.run('INSERT INTO identity_sessions VALUES(?,?,?)',createHash('sha256').update(tokenB).digest('hex'),b.address.toLowerCase(),Date.now()+60000);
  for(const [owner,token,key]of [[a,f.authToken,'signature-a'],[b,tokenB,'signature-b']]){
   const signature=await owner.signTypedData(p.typedData);const out=await (await f.handlers.handle(f.request({signature},key,token),'sign',{id:ventureId,pid:p.paymentId})).json();
   assert.ok(out.signerWallets.includes(owner.address.toLowerCase()));
  }
  assert.equal(f.db.get('SELECT status FROM treasury_payments').status,'READY');
  f.chain.nonce=1n;
  const res=await f.handlers.handle(f.request({},'stalenonce'),'execute',{id:ventureId,pid:p.paymentId});assert.equal(res.status,409);
  assert.equal(f.db.get('SELECT count(*) n FROM treasury_signatures').n,0);assert.equal(f.sends.length,0);
 }finally{f.close();}
});
test('Next route wrapper forwards authentication and never bypasses the service',async()=>{
 const f=setup();const old=process.env.VESTIGE_AUTH_URI;
 try{
  const {registerTreasuryRuntime}=await import('../../src/modules/treasury/runtime.mjs');registerTreasuryRuntime(f.service);process.env.VESTIGE_AUTH_URI='http://localhost:3200';
  const {POST}=await import('../../app/api/treasury/ventures/[id]/payments/route.ts');
  const res=await POST(f.request({recipient:addr(600),amountRaw:'1',reason:'route wrapper'}),{params:Promise.resolve({id:ventureId})});assert.equal(res.status,200);
  registerTreasuryRuntime(null);
 }finally{if(old===undefined)delete process.env.VESTIGE_AUTH_URI;else process.env.VESTIGE_AUTH_URI=old;f.close();}
});

test('a pending off-chain seat cannot propose even if the chain has its wallet',async()=>{
 const f=setup();try{
  f.db.run("UPDATE identity_seats SET world_status='PENDING'");
  assert.equal((await f.handlers.handle(f.request({recipient:addr(600),amountRaw:'1',reason:'blocked'}),'payments',{id:ventureId})).status,403);
 }finally{f.close();}
});

test('UNKNOWN HTTP operations reconcile from an operator-reviewed journal hash without resending',async()=>{
 const f=setup();try{
  f.io.send=async()=>{throw new Error('timeout');};const {ventureId:_,...request}=await f.fund();
  const body=JSON.parse(JSON.stringify(request,(_,v)=>typeof v==='bigint'?String(v):v));
  const out=await(await f.handlers.handle(f.request(body,'unknownfund'),'fund',{id:ventureId})).json();assert.equal(out.status,'UNKNOWN');
  const row=f.db.get('SELECT relay_id FROM treasury_operations WHERE operation_id=?',out.operationId);assert.ok(row.relay_id);
  f.io.inspectNonce=async()=>({match:true});const hash='0x'+'55'.repeat(32);
  await f.relay.reconcileNonce({id:row.relay_id,txHash:hash,review:{approved:true,reference:'LOCAL_TEST_ONLY'}});
  await f.service.reconcileOperations(ventureId);
  assert.equal(f.db.get('SELECT status FROM treasury_operations WHERE operation_id=?',out.operationId).status,'EXECUTED');
 }finally{f.close();}
});

test('a different retry key cannot detach a payment from its pending execution',async()=>{
 const f=setup();try{
  const p=await(await f.handlers.handle(f.request({recipient:addr(600),amountRaw:'1',reason:'pending execution'}),'payments',{id:ventureId})).json();
  for(const owner of [a,b])f.db.run('INSERT INTO treasury_signatures VALUES(?,?,?,?)',p.paymentId,owner.address.toLowerCase(),await owner.signTypedData(p.typedData),Date.now());
  f.db.run("UPDATE treasury_payments SET status='READY' WHERE payment_id=?",p.paymentId);
  const first=await(await f.handlers.handle(f.request({},'execute-first'),'execute',{id:ventureId,pid:p.paymentId})).json();assert.equal(first.status,'SUBMITTED');
  const repeat=await f.handlers.handle(f.request({},'execute-other'),'execute',{id:ventureId,pid:p.paymentId});assert.equal(repeat.status,409);
  assert.equal(f.db.get('SELECT operation_id FROM treasury_payments').operation_id,first.operationId);
  await f.service.reconcileOperations(ventureId);assert.equal(f.db.get('SELECT status FROM treasury_payments').status,'EXECUTED');
 }finally{f.close();}
});

test('revisiting an executed payment never rewrites its history to FAILED',async()=>{
 const f=setup();try{
  const p=await(await f.handlers.handle(f.request({recipient:addr(600),amountRaw:'1',reason:'terminal history'}),'payments',{id:ventureId})).json();
  f.db.run("UPDATE treasury_payments SET status='EXECUTED' WHERE payment_id=?",p.paymentId);f.chain.nonce=1n;
  await f.handlers.handle(f.request({signature:'0x'},'later-sign'),'sign',{id:ventureId,pid:p.paymentId});
  assert.equal(f.db.get('SELECT status FROM treasury_payments').status,'EXECUTED');
 }finally{f.close();}
});

test('bearer routes reject an insecure non-local authentication origin',()=>{
 assert.throws(()=>createTreasuryHandlers({}, {authURI:'http://public.invalid'}),/HTTPS_AUTH_ORIGIN_REQUIRED/);
});
