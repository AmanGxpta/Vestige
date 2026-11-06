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
