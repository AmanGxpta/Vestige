import test from 'node:test';
import assert from 'node:assert/strict';
import {TreasurySummaryPort} from '../../src/modules/treasury/summary-port.mjs';
import {manifestFixture,blockHash} from './service-fixtures.mjs';
const id=manifestFixture().ventureId;
function fixture(){const service={manifests:[manifestFixture()],context:async()=>({state:{blockNumber:10n,blockHash}}),store:{source:()=> 'TESTED_IN_SIMULATOR'}};const client={getChainId:async()=>1874,getBlock:async()=>({hash:blockHash}),readContract:async r=>r.functionName==='decimals'?6:0n};return {service,client,port:new TreasurySummaryPort({service,client,now:()=>10000})};}
test('summary keeps absent, failed and reorged observations null',async()=>{
 const f=fixture();f.service.manifests=[];assert.deepEqual(await f.port.summary(id),{treasuryActive:null,funded:null,observedAt:'1970-01-01T00:00:10.000Z',source:'vestige-treasury:UNKNOWN',verificationStatus:'UNKNOWN'});
 f.service.manifests=[manifestFixture()];f.client.getBlock=async()=>({hash:'0x'+'77'.repeat(32)});assert.equal((await f.port.summary(id)).treasuryActive,null);
 f.service.context=async()=>{throw new Error('RPC');};assert.equal((await f.port.summary(id)).funded,null);
});
test('summary distinguishes confirmed zero from unknown and retains simulator source',async()=>{
 const f=fixture();let r=await f.port.summary(id);assert.equal(r.treasuryActive,true);assert.equal(r.funded,false);assert.equal(r.source,'WHITECHAIN_RPC+TESTED_IN_SIMULATOR');
 f.client.readContract=async()=>{throw new Error('RPC');};r=await f.port.summary(id);assert.equal(r.treasuryActive,true);assert.equal(r.funded,null);
 f.client.readContract=async r=>r.functionName==='decimals'?6:1n;assert.equal((await f.port.summary(id)).funded,true);
});
