import { createRequire } from 'node:module';
import { RestrictedRelayer } from '../../src/modules/relayer/relayer.mjs';
const require = createRequire(new URL('../../src/modules/relayer/package.json',import.meta.url));
export const { privateKeyToAccount } = require('viem/accounts');
export const { zeroAddress } = require('viem');
// Public deterministic test identities; never used for live sending.
export const a = privateKeyToAccount(`0x${'1'.padStart(64,'0')}`);
export const b = privateKeyToAccount(`0x${'2'.padStart(64,'0')}`);
export const addr = n => `0x${n.toString(16).padStart(40,'0')}`;
export const ventureId = `0x${'ab'.repeat(32)}`;
export class MemoryJournal {
  state = {requests:{},counts:{},spent:'0'};
  busy = false;
  async run(fn) { if (this.busy) throw new Error('JOURNAL_BUSY'); this.busy=true;
    try { return await fn({state:this.state,commit:async()=>{}}); } finally { this.busy=false; } }
}
export function fixture(overrides = {}) {
  const token = {address:addr(100),domain:{name:'Tether USD',version:'1',chainId:1874,verifyingContract:addr(100)}};
  const manifest = {ventureId,safe:addr(200),guard:addr(300),registry:addr(400),singleton:addr(500)};
  const chain = {chainId:1874,owners:[a.address,b.address],seats:[true,true],threshold:2,
    guard:manifest.guard,registry:manifest.registry,ventureId,modules:[],handler:zeroAddress,
    singleton:manifest.singleton,fingerprintsVerified:true,attester:addr(888),nonce:0n};
  const sends=[]; const simulated=[];
  const io = {sender:addr(999),snapshot:async()=>chain,gasPrice:async()=>1n,
    estimate:async()=>100000n,balance:async()=>10n**18n,
    simulate:async call=>{simulated.push(call);return true;},
    send:async call=>{sends.push(call);return `0x${'cd'.repeat(32)}`;},
    senderNonce:async()=>0,quoteL1:async()=>({l1Fee:1n,blockNumber:10n,blockHash:'0x'+'66'.repeat(32),at:1000000}),
    confirm:async()=>({verified:true,blockNumber:10n,blockHash:'0x'+'66'.repeat(32),fee:{evm:100n,l1:1n}})};
  const limits = {dailyBudgetWei:10n**18n,maxGas:500000n,maxGasPrice:10n**9n,
    l1FeeReserveWei:10000n,minBalanceWei:1000n,maxPerMinute:10};
  const journal = new MemoryJournal();
  const relay = new RestrictedRelayer({manifests:[manifest],token,io,journal,limits,now:()=>1000,enabled:true,safety:{ready:async()=>{},notify:async()=>{}},...overrides});
  const request = {ventureId,from:a.address,to:manifest.safe,value:1000000n,validAfter:1n,
    validBefore:2000n,nonce:`0x${'ef'.repeat(32)}`};
  return {token,manifest,chain,io,limits,journal,relay,request,sends,simulated,
    fund:async changes=>{const r={...request,...changes};r.signature=await a.signTypedData(relay.fundingTyped(r,manifest));return r;},
    payment:async changes=>{const r={ventureId,recipient:addr(600),amount:500000n,nonce:0n,...changes};
      r.signatures=await Promise.all([a,b].map(account=>account.signTypedData(relay.paymentTyped(r,manifest))));return r;}};
}
