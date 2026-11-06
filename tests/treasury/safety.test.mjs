import test from 'node:test';
import assert from 'node:assert/strict';
import {RestrictedRelayer} from '../../src/modules/relayer/relayer.mjs';
import {fixture} from './fixtures.mjs';
test('relay sends are disabled unless configuration and fee policy are explicitly reviewed',async()=>{
 const f=fixture();const r=new RestrictedRelayer({manifests:[f.manifest],token:f.token,io:f.io,journal:f.journal,limits:f.limits,now:()=>1000});
 await assert.rejects(r.fund(await f.fund()),/RELAYER_DISABLED/);assert.equal(f.sends.length,0);
});
import {relayConfiguration,RelaySafety,AlertHooks,webhookAlerts,limitsDigest} from '../../src/modules/relayer/safety.mjs';
import {createReviewedRelayer} from '../../src/modules/relayer/configured.mjs';
import {addr,txHash,blockHash} from './service-fixtures.mjs';
test('blank or malformed fee/rate settings cannot enable the runtime',()=>{
 assert.throws(()=>relayConfiguration({RELAYER_ENABLED:'true'}),/UNCONFIGURED/);
 assert.equal(relayConfiguration({RELAYER_ENABLED:'false'}).enabled,false);
 assert.throws(()=>relayConfiguration({RELAYER_ENABLED:'yes'}),/INVALID/);
 assert.throws(()=>webhookAlerts('http://public.invalid'),/INVALID_ALERT/);
 const r=createReviewedRelayer({env:{RELAYER_ENABLED:'false'}});assert.equal(r.enabled,false);
});
test('local measurements can never authorize a live RPC or survive limit changes',async()=>{
 const f=fixture(),alerts=new AlertHooks(async()=>true);
 const review={scope:'LOCAL_FORK_ONLY',chainId:1874,reference:'LOCAL_TEST_ONLY',expiresAt:'2099-01-01T00:00:00Z',limitsDigest:limitsDigest(f.limits)};
 const safety=new RelaySafety({review,alerts});
 await assert.rejects(safety.ready({isLocalFork:async()=>false},f.limits,Date.now()),/LOCAL_POLICY_ON_LIVE/);
 await assert.rejects(safety.ready({isLocalFork:async()=>true},{...f.limits,maxGas:1n},Date.now()),/UNREVIEWED/);
 const live=new RelaySafety({review:{...review,scope:'LIVE',measurements:[]},alerts,roles:{deployer:addr(1),registrar:addr(2)}});
 await assert.rejects(live.ready({sender:addr(999)},f.limits,Date.now()),/REVIEW_MISSING/);
});
test('alert transport failure durably opens the circuit before sending',async()=>{
 const f=fixture();f.relay.safety={ready:async()=>{throw new Error('ALERT_TRANSPORT_FAILED');},notify:async()=>{throw new Error();}};
 await assert.rejects(f.relay.fund(await f.fund()),/ALERT_TRANSPORT_FAILED/);
 assert.equal(f.journal.state.halt.reason,'ALERT_TRANSPORT_FAILED');assert.equal(f.sends.length,0);
});
test('L1 quote, balance and manifest drift trigger alerts and persist a circuit',async()=>{
 for(const modify of [f=>f.io.quoteL1=async()=>({l1Fee:10n**18n,at:1000000}),f=>f.io.balance=async()=>0n,f=>f.chain.fingerprintsVerified=false]){
  const f=fixture();const events=[];f.relay.safety.notify=async event=>events.push(event);modify(f);
  await assert.rejects(f.relay.fund(await f.fund()));assert.equal(f.sends.length,0);assert.ok(f.journal.state.halt);assert.ok(events.length>0);
 }
});
test('observed fees exceeding reserve retain replay protection and stop the next send',async()=>{
 const f=fixture();const sent=await f.relay.fund(await f.fund());
 f.io.confirm=async()=>({verified:true,blockNumber:10n,blockHash,fee:{evm:100n,l1:10n**18n}});
 assert.equal((await f.relay.confirm(sent.id)).status,'EXECUTED');
 assert.equal(f.journal.state.requests[sent.id].usedWei,String(10n**18n+100n));
 await assert.rejects(f.relay.fund(await f.fund({nonce:'0x'+'22'.repeat(32)})),/CIRCUIT/);
 assert.equal(f.sends.length,1);
});
test('operator nonce reconciliation attaches matching evidence but never resends',async()=>{
 const f=fixture();f.io.send=async()=>{throw new Error('timeout');};
 await assert.rejects(f.relay.fund(await f.fund()),/UNKNOWN/);
 const id=Object.keys(f.journal.state.requests)[0];f.io.inspectNonce=async()=>({match:true});
 await assert.rejects(f.relay.reconcileNonce({id,txHash}),/OPERATOR_REVIEW/);
 assert.equal((await f.relay.reconcileNonce({id,txHash,review:{approved:true,reference:'LOCAL_TEST_RECOVERY'}})).status,'SUBMITTED');
 await assert.rejects(f.relay.clearCircuit({approved:true,reference:'LOCAL_TEST'}),/IN_FLIGHT/);
 assert.equal((await f.relay.confirm(id)).status,'EXECUTED');
 await f.relay.clearCircuit({approved:true,reference:'LOCAL_TEST'});assert.equal(f.journal.state.halt,null);
});
test('monitor transport receives only allowed event metrics, never user payloads',async()=>{
 let message;const alerts=new AlertHooks(async value=>{message=value;return true;});
 await alerts.notify('simulation_failure',{gas:1n,signature:'0xsecret',token:'not-a-token',body:{private:true}});
 assert.deepEqual(message,{event:'simulation_failure',metrics:{gas:'1'}});
});

test('an invalid review expiry cannot enable fee policy',async()=>{
 const f=fixture();const safety=new RelaySafety({review:{scope:'LOCAL_FORK_ONLY',chainId:1874,reference:'LOCAL_TEST',expiresAt:'invalid',limitsDigest:limitsDigest(f.limits)},alerts:new AlertHooks(async()=>true)});
 await assert.rejects(safety.ready({isLocalFork:async()=>true},f.limits,Date.now()),/UNREVIEWED/);
});

test('a malformed transport result remains UNKNOWN rather than a claimed submission',async()=>{
 const f=fixture();f.io.send=async()=>undefined;
 await assert.rejects(f.relay.fund(await f.fund()),/UNKNOWN/);
 assert.equal(Object.values(f.journal.state.requests)[0].status,'UNKNOWN');
});

test('an unattempted reservation can be abandoned only by explicit review and unchanged nonce',async()=>{
 const f=fixture();const sent=await f.relay.fund(await f.fund());const item=f.journal.state.requests[sent.id];item.status='RESERVED';delete item.broadcastAttemptedAt;delete item.hash;
 assert.equal((await f.relay.reconcileNonce({id:sent.id,abandonUnsent:true,review:{approved:true,reference:'LOCAL_TEST'}})).status,'FAILED');
 assert.ok(f.journal.state.requests[sent.id]);assert.equal(f.sends.length,1);
});

test('failed simulations still consume the configured per-wallet and venture attempt limit',async()=>{
 const f=fixture();f.limits.maxPerMinute=1;f.io.simulate=async()=>{throw new Error('revert');};const r=await f.fund();
 await assert.rejects(f.relay.fund(r),/SIMULATION_FAILED/);
 await assert.rejects(f.relay.fund(r),/RATE_LIMITED/);assert.equal(f.sends.length,0);
});

test('a confirmed receipt can replay to SQLite after a crash without charging the journal twice',async()=>{
 const f=fixture();const sent=await f.relay.fund(await f.fund());await f.relay.confirm(sent.id);
 const used=f.journal.state.usedByDay['0'];assert.equal((await f.relay.confirm(sent.id)).status,'EXECUTED');assert.equal(f.journal.state.usedByDay['0'],used);
});

test('a kill switch activated during simulation blocks the final send',async()=>{
 const f=fixture();let killed=false;f.io.isLocalFork=async()=>true;
 f.relay.safety=new RelaySafety({review:{scope:'LOCAL_FORK_ONLY',chainId:1874,reference:'LOCAL_TEST',expiresAt:'2099-01-01T00:00:00Z',limitsDigest:limitsDigest(f.limits)},alerts:new AlertHooks(async()=>true),killSwitch:()=>killed});
 f.io.simulate=async()=>{killed=true;return true;};await assert.rejects(f.relay.fund(await f.fund()),/KILL_SWITCH/);assert.equal(f.sends.length,0);
});
