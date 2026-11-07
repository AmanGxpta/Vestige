import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyManifestProvenance} from '../../src/modules/treasury/provenance.mjs';
// H decision (2026-11-07): Safe+Guard bound by strict receipt logs (no trace). Fixture is the live
// northstar creation tx/receipt captured from chain 1874 (block 12418659).
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
async function setup(){
 const m=await load('../../contracts/manifests/whitechain-1874/northstar.vestige.eth.json');const fx=await load('./fixtures-northstar-creation.json');
 const all=[...Object.values(m.contracts),m.contracts.token.implementation];
 const state={trace:0,guard:{safe:m.contracts.safe.address,registry:m.contracts.registry.address,ventureId:m.ventureId}};
 const client={getChainId:async()=>1874,getBlockNumber:async()=>12500000n,getBlock:async()=>({hash:fx.receipt.blockHash}),
  getTransactionReceipt:async({hash})=>{
   if(hash===m.contracts.safe.deploymentTxHash)return {...fx.receipt,blockNumber:BigInt(fx.receipt.blockNumber),logs:state.logs??fx.receipt.logs};
   const a=all.find(x=>x.deploymentTxHash===hash);return {status:'success',blockNumber:BigInt(a.deploymentBlock),blockHash:fx.receipt.blockHash,contractAddress:['registry','setup'].some(k=>m.contracts[k]===a)?a.address:null};},
  getTransaction:async()=>fx.tx,getCode:async({address})=>all.find(x=>x.address.toLowerCase()===address.toLowerCase()).runtimeCodeHash,
  readContract:async({functionName})=>state.guard[functionName],request:async()=>{state.trace++;throw new Error('not whitelisted');}};
 return {m,fx,client,state,opts:{codeHash:x=>x}};
}
test('live northstar Safe and Guard are receipt-bound without a trace',async()=>{
 const {m,client,state,opts}=await setup();
 const out=await verifyManifestProvenance(client,m,opts);
 assert.deepEqual(out.receiptBound,['safe','guard']);assert.equal(state.trace,0);
});
test('receipt binding refuses missing logs, a different guard tx, wrong immutables and wrong owners',async()=>{
 const cases=[
  s=>{s.state.logs=s.fx.receipt.logs.filter(l=>l.address.toLowerCase()!==s.m.contracts.factory.address.toLowerCase());},
  s=>{s.state.logs=s.fx.receipt.logs.filter(l=>l.address.toLowerCase()!==s.m.contracts.safe.address.toLowerCase());},
  s=>{s.m.contracts.guard.deploymentTxHash=s.m.contracts.registry.deploymentTxHash;s.m.contracts.guard.deploymentBlock=s.m.contracts.registry.deploymentBlock;},
  s=>{s.state.guard.safe='0x'+'12'.repeat(20);},s=>{s.state.guard.ventureId='0x'+'34'.repeat(32);},
  s=>{s.m.owners=['0x'+'56'.repeat(20),s.m.owners[1]];},s=>{s.m.setupInitializerHash='0x'+'78'.repeat(32);},
 ];
 for(const mutate of cases){const s=await setup();mutate(s);await assert.rejects(verifyManifestProvenance(s.client,s.m,s.opts),/MANIFEST_(PROVENANCE_MISMATCH|CREATION_UNPROVEN)/);}
});
test('non Safe/Guard child creations still require a trace',async()=>{
 const s=await setup();const r=s.client.getTransactionReceipt;
 s.client.getTransactionReceipt=async a=>{const x=await r(a);return a.hash===s.m.contracts.registry.deploymentTxHash?{...x,contractAddress:null}:x;};
 await assert.rejects(verifyManifestProvenance(s.client,s.m,s.opts),/MANIFEST_CREATION_UNPROVEN/);assert.equal(s.state.trace,1);
});
