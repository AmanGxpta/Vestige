import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyManifestProvenance} from '../../src/modules/treasury/provenance.mjs';
import {manifestFixture,viem,blockHash} from './service-fixtures.mjs';
function fixture(){
 const m=manifestFixture();m.kind='infrastructure';delete m.contracts.safe;delete m.contracts.guard;
 const code='0x6000';for(const a of [...Object.values(m.contracts),m.contracts.token.implementation])a.runtimeCodeHash=viem.keccak256(code);
 const client={getChainId:async()=>1874,getBlockNumber:async()=>10n,getTransactionReceipt:async()=>({status:'success',blockNumber:1n,blockHash,contractAddress:null}),getBlock:async()=>({hash:blockHash}),getCode:async()=>code,request:async()=>({type:'CALL',calls:[]})};return {m,client};
}
test('existing bytecode plus an unrelated successful receipt is not deployment provenance',async()=>{
 const {m,client}=fixture();await assert.rejects(verifyManifestProvenance(client,m),/MANIFEST_CREATION_UNPROVEN/);
});
test('a canonical successful mined CREATE trace can bind a factory deployment',async()=>{
 const {m,client}=fixture();client.request=async()=>({type:'CALL',calls:Object.values(m.contracts).concat(m.contracts.token.implementation).map(a=>({type:'CREATE2',to:a.address,output:'0x6000'}))});
 assert.deepEqual(await verifyManifestProvenance(client,m),{infrastructure:true});
});
test('reverted creation subtrees and unavailable traces never establish deployment',async()=>{
 const {m,client}=fixture();client.request=async()=>({type:'CALL',calls:[{type:'CALL',error:'revert',calls:[{type:'CREATE',to:m.contracts.registry.address}]}]});
 await assert.rejects(verifyManifestProvenance(client,m),/MANIFEST_CREATION_UNPROVEN/);
 client.request=async()=>{throw new Error('trace unavailable');};await assert.rejects(verifyManifestProvenance(client,m),/MANIFEST_CREATION_UNPROVEN/);
});
test('direct creation receipts bind each asset without requiring debug tracing',async()=>{
 const {m,client}=fixture(),addresses=new Map();let i=1;
 for(const a of [...Object.values(m.contracts),m.contracts.token.implementation]){a.deploymentTxHash='0x'+String(i++).padStart(64,'0');addresses.set(a.deploymentTxHash,a.address);}
 client.getTransactionReceipt=async({hash})=>({status:'success',blockNumber:1n,blockHash,contractAddress:addresses.get(hash)});
 client.request=async()=>{throw new Error('direct deployment must not need tracing');};
 assert.deepEqual(await verifyManifestProvenance(client,m),{infrastructure:true});
});
import {EXPLORER_ATTESTED_ANCHORS,validateManifest} from '../../src/modules/treasury/manifest.mjs';
import {readFile} from 'node:fs/promises';
// H decision A (2026-11-07): explorer-attested provenance for exactly four pre-existing anchors.
async function liveShape(){
 const m=JSON.parse(await readFile(new URL('../../contracts/manifests/whitechain-1874/infrastructure.json',import.meta.url),'utf8'));
 const own={[m.contracts.registry.deploymentTxHash]:m.contracts.registry,[m.contracts.setup.deploymentTxHash]:m.contracts.setup};
 const codeFor=a=>{const all=[m.contracts.registry,m.contracts.setup,m.contracts.singleton,m.contracts.factory,m.contracts.token,m.contracts.token.implementation];const x=all.find(x=>x.address.toLowerCase()===a.toLowerCase());return x?'0x'+x.runtimeCodeHash.slice(2):'0x';};
 const calls={code:[],trace:0};
 const client={getChainId:async()=>1874,getBlockNumber:async()=>12500000n,
  getTransactionReceipt:async({hash})=>{const o=own[hash];const all=[m.contracts.singleton,m.contracts.factory,m.contracts.token,m.contracts.token.implementation,m.contracts.registry,m.contracts.setup];const a=all.find(x=>x.deploymentTxHash===hash);
   return {status:'success',blockNumber:BigInt(a.deploymentBlock),blockHash,contractAddress:o?o.address:null};},
  getBlock:async()=>({hash:blockHash}),
  // Code bytes are modelled so that keccak(code) is the manifest hash via a lookup shim below.
  getCode:async({address,blockNumber})=>{calls.code.push([address,blockNumber]);return 'CODE:'+address.toLowerCase();},
  request:async()=>{calls.trace++;throw new Error('not whitelisted');}};
 return {m,client,calls,codeFor};
}
const hashOf=m=>code=>{const addr=code.slice(5);const all=[m.contracts.registry,m.contracts.setup,m.contracts.singleton,m.contracts.factory,m.contracts.token,m.contracts.token.implementation];return all.find(x=>x.address.toLowerCase()===addr).runtimeCodeHash;};
test('explorer-attested mode accepts exactly the four anchors at their pinned live code hash; own deployments stay strict',async()=>{
 const {m,client,calls}=await liveShape();
 assert.deepEqual(Object.keys(EXPLORER_ATTESTED_ANCHORS).sort(),['factory','singleton','token','tokenImplementation']);
 const out=await verifyManifestProvenance(client,m,{codeHash:hashOf(m)});
 assert.equal(out.infrastructure,true);assert.deepEqual(out.explorerAttested.sort(),['factory','singleton','token','tokenImplementation']);
 assert.equal(calls.trace,0);
 // Own deployments were read at their receipt block; anchors at the current head only.
 assert.ok(calls.code.some(([a,b])=>a===m.contracts.registry.address&&b===12417009n));
 assert.ok(calls.code.some(([a,b])=>a===m.contracts.singleton.address&&b===12500000n));
});
test('explorer-attested label is refused on own deployments, on non-anchor addresses and on drifted code',async()=>{
 const {m}=await liveShape();
 for(const mutate of [x=>{x.contracts.registry.provenance='EXPLORER_ATTESTED';},x=>{x.contracts.setup.provenance='EXPLORER_ATTESTED';},
  x=>{x.contracts.singleton.runtimeCodeHash='0x'+'11'.repeat(32);},x=>{x.contracts.token.implementation.address='0x'+'22'.repeat(20);},
  x=>{x.contracts.factory.provenance='TRUSTED';}]){
  const c=structuredClone(m);mutate(c);assert.throws(()=>validateManifest(c,{infrastructure:true}),/INVALID_DEPLOYMENT_MANIFEST/);
 }
 // Live drift at head is refused even with a valid manifest.
 const {client}=await liveShape();const drift=hashOf(m);
 await assert.rejects(verifyManifestProvenance(client,m,{codeHash:c=>c.includes(m.contracts.factory.address.toLowerCase())?'0x'+'33'.repeat(32):drift(c)}),/MANIFEST_PROVENANCE_MISMATCH/);
 // An own deployment whose receipt lacks contractAddress still requires a trace and fails closed.
 const {client:c2}=await liveShape();const r=c2.getTransactionReceipt;c2.getTransactionReceipt=async a=>({...(await r(a)),contractAddress:null});
 await assert.rejects(verifyManifestProvenance(c2,m,{codeHash:hashOf(m)}),/MANIFEST_CREATION_UNPROVEN/);
 // Unlabelled anchors keep the old strict behaviour.
 const strict=structuredClone(m);for(const k of ['singleton','factory','token'])delete strict.contracts[k].provenance;delete strict.contracts.token.implementation.provenance;
 const {client:c3}=await liveShape();await assert.rejects(verifyManifestProvenance(c3,strict,{codeHash:hashOf(m)}),/MANIFEST_CREATION_UNPROVEN/);
});
