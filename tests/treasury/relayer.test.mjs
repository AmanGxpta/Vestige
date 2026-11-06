import test from 'node:test';
import { fixture, a, addr } from './fixtures.mjs';
import assert from 'node:assert/strict';
import { RestrictedRelayer } from '../../src/modules/relayer/relayer.mjs';

test('unknown venture cannot choose a relay destination', async () => {
  let sends = 0;
  const relay = new RestrictedRelayer({ send: async () => { sends++; } });
  await assert.rejects(relay.fund({ ventureId: 'unregistered', to: 'attacker' }));
  assert.equal(sends, 0);
});

test('treasury activation rejects unsafe configuration', async()=>{
 const f=fixture();f.chain.threshold=1;
 await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
});

test('funding recipient and expiry are bound to policy', async()=>{
 for(const changes of [{to:addr(777)},{validBefore:1000n},{validAfter:1000n},{value:0n}]){
  const f=fixture();await assert.rejects(f.relay.fund(await f.fund(changes)));assert.equal(f.sends.length,0);
 }
});

test('a signed authorization cannot change its amount', async()=>{
 const f=fixture();const r=await f.fund();r.value++;
 await assert.rejects(f.relay.fund(r));assert.equal(f.sends.length,0);
});

test('one owner cannot relay a payment', async()=>{
 const f=fixture();const r=await f.payment();r.signatures.pop();
 await assert.rejects(f.relay.execute(r));assert.equal(f.sends.length,0);
});

test('the same authorization cannot be submitted twice', async()=>{
 const f=fixture();const r=await f.fund();await f.relay.fund(r);
 await assert.rejects(f.relay.fund(r));assert.equal(f.sends.length,1);
});

test('rate-limited requests never send', async()=>{
 const f=fixture();f.limits.maxPerMinute=0;
 await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
});

test('daily WBT budget cannot be oversubscribed', async()=>{
 const f=fixture();f.limits.dailyBudgetWei=1n;
 await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
});

test('low gas balance rejects before submission', async()=>{
 const f=fixture();f.io.balance=async()=>0n;
 await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
});

test('simulation failures cost no submitted gas', async()=>{
 const f=fixture();f.io.simulate=async()=>{throw new Error('CHAIN_REVERT');};
 await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
 assert.equal(Object.keys(f.journal.state.requests).length,0);
});

test('valid funding simulates with the actual sender then submits exact token call', async()=>{
 const f=fixture();const result=await f.relay.fund(await f.fund());
 assert.equal(result.status,'SUBMITTED');assert.equal(f.sends.length,1);
 assert.equal(f.simulated[0].account,f.io.sender);assert.equal(f.sends[0].to,f.token.address);
 assert.equal(f.sends[0].value,0n);
 const confirmed=await f.relay.confirm(result.id);assert.equal(confirmed.status,'EXECUTED');
});
test('duplicate owners, outsider signers, altered payments and stale nonces fail', async()=>{
 for(const alter of [r=>r.signatures[1]=r.signatures[0],r=>r.amount++,r=>r.recipient=addr(700),r=>r.nonce++]){
  const f=fixture();const r=await f.payment();alter(r);await assert.rejects(f.relay.execute(r));assert.equal(f.sends.length,0);
 }
});
test('two owners relay sorted signatures and never authorize a delegatecall or refund', async()=>{
 const f=fixture();const r=await f.payment();r.signatures.reverse();
 const result=await f.relay.execute(r);assert.equal(result.status,'SUBMITTED');assert.equal(f.sends[0].to,f.manifest.safe);
 await assert.rejects(f.relay.execute(r));assert.equal(f.sends.length,1);
});
test('unsafe modules, guard, seats, handler, singleton, code or network fail closed', async()=>{
 for(const change of [{modules:[addr(77)]},{guard:addr(77)},{seats:[true,false]},
   {handler:addr(77)},{singleton:addr(77)},{fingerprintsVerified:false},{chainId:1}]){
  const f=fixture();Object.assign(f.chain,change);await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);
 }
});
test('an ambiguous broadcast remains reserved and is never automatically retried', async()=>{
 const f=fixture();const r=await f.fund();f.io.send=async()=>{throw new Error('timeout');};
 await assert.rejects(f.relay.fund(r),/SUBMISSION_UNKNOWN_NO_RETRY/);
 assert.equal(Object.values(f.journal.state.requests)[0].status,'UNKNOWN');
 await assert.rejects(f.relay.fund(r),/DUPLICATE_OR_PENDING/);
 assert.ok(BigInt(f.journal.state.spent)>0n);
});
test('a missing receipt or failed independent check cannot become EXECUTED', async()=>{
 const f=fixture();const result=await f.relay.fund(await f.fund());f.io.confirm=async()=>({verified:false});
 await assert.rejects(f.relay.confirm(result.id),/UNVERIFIED_RECEIPT/);
 assert.equal(f.journal.state.requests[result.id].status,'SUBMITTED');
});
test('concurrent submissions cannot oversubscribe one durable reservation', async()=>{
 const f=fixture();const r=await f.fund();const results=await Promise.allSettled([f.relay.fund(r),f.relay.fund(r)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sends.length,1);
});
test('gas quote spikes and excessive estimates never broadcast', async()=>{
 for(const change of [f=>f.io.gasPrice=async()=>10n**18n,f=>f.io.estimate=async()=>10n**9n]){
  const f=fixture();change(f);await assert.rejects(f.relay.fund(await f.fund()),/GAS_CAP/);assert.equal(f.sends.length,0);
 }
});

test('wallet and venture limits each independently reject without submission',async()=>{
 for(const key of ['wallet:'+a.address.toLowerCase(),'venture:'+fixture().manifest.ventureId]){
  const f=fixture();f.journal.state.minute=16;f.journal.state.day=0;f.journal.state.counts[key]=10;
  await assert.rejects(f.relay.fund(await f.fund()),/RATE_LIMITED/);assert.equal(f.sends.length,0);
 }
});
test('wrong-chain token domains and malformed amounts cannot reach the signer',async()=>{
 const f=fixture();f.token.domain.chainId=1;await assert.rejects(f.relay.fund(await f.fund()),/WRONG_DOMAIN/);
 for(const value of [-1n,0.1,'100']){
  const f=fixture();const request=await f.fund();request.value=value;
  await assert.rejects(f.relay.fund(request));assert.equal(f.sends.length,0);
 }
});
test('known mined failure is recorded as FAILED instead of EXECUTED',async()=>{
 const f=fixture();const sent=await f.relay.fund(await f.fund());f.io.confirm=async()=>({failed:true});
 assert.equal((await f.relay.confirm(sent.id)).status,'FAILED');
 assert.equal(f.journal.state.requests[sent.id].status,'FAILED');
});

test('the gas sender cannot be a founder or the seat attester',async()=>{
 for(const role of ['founder','attester']){
  const f=fixture();f.io.sender=role==='founder'?a.address:f.chain.attester;
  await assert.rejects(f.relay.fund(await f.fund()),/ROLE_SEPARATION/);assert.equal(f.sends.length,0);
 }
});

test('an unresolved sender nonce blocks other intents until reconciliation',async()=>{
 const f=fixture();let sends=0;f.io.send=async()=>{sends++;throw new Error('timeout');};
 await assert.rejects(f.relay.fund(await f.fund()),/SUBMISSION_UNKNOWN_NO_RETRY/);
 const next=await f.fund({nonce:`0x${'12'.repeat(32)}`});
 await assert.rejects(f.relay.fund(next),/WALLET_IN_FLIGHT/);assert.equal(sends,1);
});
