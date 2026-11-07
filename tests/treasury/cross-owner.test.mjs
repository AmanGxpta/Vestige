import test from 'node:test';
import assert from 'node:assert/strict';
import {materialize} from './cross-owner/materialize.mjs';
import {harness} from './cross-owner/harness.mjs';
import {a,addr,viem} from './service-fixtures.mjs';
const modules=await materialize();
test('actual current C2 authenticates reads but second founder remains blocked by v0 missing typed data',async()=>{
 const f=await harness(modules,modules.product,{draft:false});try{
  const p=await f.ca.proposePayment(f.id,{recipient:addr(600),amountRaw:'1',reason:'fixture',wallet:a.address});
  assert.equal(p.ok,true);assert.equal(p.value.payments.length,1);
  const get=f.calls.filter(c=>c.method==='GET'&&c.path.startsWith('/api/treasury')).at(-1);assert.equal(get.hasBearer,true);
  const result=await f.cb.signPayment(f.id,p.value.payments[0].paymentId,{wallet:b.address},()=>{throw new Error('must not sign');});
  assert.equal(result.ok,false);assert.equal(result.error.code,'BLOCKED');
 }finally{await f.close();}
});
test('actual C1 root shares SQLite, reuses session auth, and leaves CR-ID-05 summaries null',async()=>{
 const f=await harness(modules,modules.product);try{
  const again=await f.root.ready();assert.equal(again.identity.db,again.store.db);assert.equal(again.identity.db,f.db);assert.equal(again.treasury.relay.enabled,false);
  await assert.rejects(again.seatAttester.attestSeat({ventureId:f.id,wallet:a.address,nullifierHash:'0x'+'ab'.repeat(32)}),e=>e.code==='ATTESTATION_DISABLED');
  f.composed.identity.ventures.setListing(a.address.toLowerCase(),f.id,{listed:true});
  for(const row of f.db.all('SELECT wallet FROM identity_seats WHERE venture_id=?',f.id))f.composed.identity.ventures.setListing(row.wallet,f.id,{listed:true});
  const list=await f.composed.identity.ventures.publicList(()=>false);assert.equal(list[0].treasuryActive,null);assert.equal(list[0].funded,null);
  await f.ca.signOut();assert.equal(f.ca.sessionWallet(),null);
 }finally{await f.close();}
});
import {candidateProduct} from './cross-owner/materialize.mjs';
import {b} from './service-fixtures.mjs';
const candidate=await candidateProduct(modules);
test('candidate C2 payload patch works against actual C1 auth and X proposed handlers across reload and two approvals',async()=>{
 const f=await harness(modules,candidate);try{
  const created=await f.ca.proposePayment(f.id,{recipient:addr(600),amountRaw:'500000',reason:'founder-private fixture',wallet:a.address});assert.equal(created.ok,true);
  assert.equal(created.value.payments.length,1);const p=created.value.payments[0];assert.ok(p.safeTypedData);assert.equal(p.safeNonce,'0');assert.equal(p.signerWallets.length,0);
  assert.equal(viem.hashTypedData(p.safeTypedData),p.safeTxHash);assert.equal(created.value.depositsStatus,'VERIFIED');
  const keys=f.calls.find(c=>c.responseKeys)?.responseKeys;assert.ok(keys.includes('safeTypedData'));assert.equal(keys.includes('typedData'),false);
  const aa=await f.ca.signPayment(f.id,p.paymentId,{wallet:a.address},td=>a.signTypedData(td));assert.equal(aa.ok,true);assert.equal(aa.value.payments[0].signerWallets.length,1);
  const reloaded=await f.cb.getTreasury(f.id);assert.equal(reloaded.ok,true);assert.equal(reloaded.value.payments[0].safeTxHash,p.safeTxHash);assert.equal(reloaded.value.payments[0].signerWallets.length,1);
  const bb=await f.cb.signPayment(f.id,p.paymentId,{wallet:b.address},td=>b.signTypedData(td));assert.equal(bb.ok,true);assert.equal(bb.value.payments[0].status,'READY');assert.equal(bb.value.payments[0].signerWallets.length,2);
  assert.ok(f.calls.filter(c=>c.path.endsWith('/sign')).every(c=>c.hasIdempotency));
  const publicState=await f.service.read(f.id,null);assert.deepEqual(publicState.payments,[]);assert.equal(publicState.provenance.source,'TESTED_IN_SIMULATOR');
  f.f.chain.nonce=1n;const stale=await f.ca.getTreasury(f.id);assert.equal(stale.value.payments[0].status,'FAILED');assert.equal(stale.value.payments[0].safeTypedData,null);assert.deepEqual(stale.value.payments[0].signerWallets,[]);
 }finally{await f.close();}
});
test('candidate C2 preserves an incomplete deposit scan instead of claiming complete history',()=>{
 const raw={schemaVersion:1,ventureId:'0x'+'ab'.repeat(32),treasury:null,verificationStatus:'UNKNOWN',depositsStatus:'PENDING',deposits:[],payments:[]};
 assert.equal(modules.product.toTreasuryState(raw).depositsStatus,undefined);
 assert.equal(candidate.toTreasuryState(raw).depositsStatus,'PENDING');
});
test('C1 logout invalidates the actual shared session used by X',async()=>{
 const f=await harness(modules,candidate);try{
  assert.equal((await f.ca.getTreasury(f.id)).ok,true);
  f.db.run('DELETE FROM identity_sessions WHERE wallet=?',a.address.toLowerCase());
  const r=await f.ca.getTreasury(f.id);assert.equal(r.ok,false);assert.equal(r.error.code,'UNAUTHENTICATED');assert.equal(f.ca.sessionWallet(),null);
 }finally{await f.close();}
});
test('candidate actual C2 fund and execution methods use X handlers without signature bytes in readback',async()=>{
 const f=await harness(modules,candidate);try{
  let fundedIntent;
  const funding=await f.ca.fundTreasury(f.id,{from:a.address,to:f.manifest.contracts.safe.address,amountRaw:'1000000'},async td=>{fundedIntent=td;return a.signTypedData(td);});
  assert.equal(funding.ok,true);assert.equal(fundedIntent.domain.chainId,1874);assert.equal(fundedIntent.message.to,f.manifest.contracts.safe.address);
  const created=await f.ca.proposePayment(f.id,{recipient:addr(600),amountRaw:'500000',reason:'private',wallet:a.address});const p=created.value.payments[0];
  await f.ca.signPayment(f.id,p.paymentId,{wallet:a.address},td=>a.signTypedData(td));await f.cb.signPayment(f.id,p.paymentId,{wallet:b.address},td=>b.signTypedData(td));
  const executed=await f.ca.executePayment(f.id,p.paymentId,{wallet:a.address});assert.equal(executed.ok,true);assert.equal(executed.value.payments[0].status,'EXECUTED');assert.equal(executed.value.payments[0].safeTypedData,null);assert.equal(executed.value.payments[0].relay.status,'EXECUTED');
  assert.equal(JSON.stringify(executed.value).includes('signature'),false);
 }finally{await f.close();}
});
