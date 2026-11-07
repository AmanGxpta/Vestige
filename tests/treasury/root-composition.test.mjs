import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRootComposition} from '../../src/modules/treasury/root-composition.mjs';
import {registerTreasuryRuntime} from '../../src/modules/treasury/runtime.mjs';
import {sqlFixture} from './service-fixtures.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const manifest='contracts/manifests/whitechain-1874/infrastructure.json';
const KEY='0x59c6995e998f97a5a0044966f0b8d6a7c84b0a1dec3e4b2bc6b3e3e5a6b7d8e9';
const client={getChainId:async()=>1874};
async function compose(extra={}){
 const f=sqlFixture();let registered;
 const identityModule={registerSeatAttester(p){registered=p;},getIdentityServices(){return {db:f.db,auth:{authenticate:()=>'0x'+'11'.repeat(20)}};}};
 const env={VESTIGE_DB_PATH:':memory:',VESTIGE_AUTH_URI:'http://localhost:3200',WHITECHAIN_RPC_URL:'http://127.0.0.1:1',VESTIGE_DEPLOYMENT_MANIFEST_PATH:manifest,...extra};
 const cwd=process.cwd();process.chdir(repo);
 try{const r=await createRootComposition({identityModule,env,client}).ready();return {f,r,registered};}finally{process.chdir(cwd);}
}
test('root composition defaults to v1 readback and keeps attestation disabled without the attester key',async()=>{
 const {f,r,registered}=await compose();try{
  assert.equal(r.attesterMode,'DISABLED');assert.equal(r.mode,'READ_ONLY');
  await assert.rejects(r.seatAttester.attestSeat({ventureId:'0x'+'ab'.repeat(32),wallet:'0x'+'12'.repeat(20),nullifierHash:'0x'+'cd'.repeat(32)}),/ATTESTATION_DISABLED/);
  assert.ok(registered);assert.equal(typeof r.treasury.readPort,'object');
  const out=await r.treasury.read('0x'+'ab'.repeat(32),null);assert.equal(out.schemaVersion,1);
 }finally{registerTreasuryRuntime(null);f.close();}
});
test('attester key enables only the attestSeat transport bound to the manifest registry and is never exposed',async()=>{
 const {f,r}=await compose({VESTIGE_ATTESTER_PRIVATE_KEY:KEY});try{
  assert.equal(r.attesterMode,'ENABLED');
  assert.equal(r.seatAttester.registry.address,'0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA');
  assert.equal(await r.seatAttester.authorizeSend(),true);
  const dump=JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v)+JSON.stringify(Object.entries(r.seatAttester));
  assert.ok(!dump.toLowerCase().includes(KEY.slice(2).toLowerCase()));
  await assert.rejects(r.seatAttester.send({to:'0x'+'99'.repeat(20),data:'0x',value:0n,nonce:0,account:r.seatAttester.attester}),e=>e.preBroadcast&&e.message==='ATTESTER_TARGET_REFUSED');
 }finally{registerTreasuryRuntime(null);f.close();}
});
test('a malformed or mismatched attester key disables attestation only and keeps reads available',async()=>{
 for(const extra of [{VESTIGE_ATTESTER_PRIVATE_KEY:'0xdeadbeef'},{VESTIGE_ATTESTER_PRIVATE_KEY:KEY,ATTESTER_ADDRESS:'0x84068C51A9236A869E5F05FBA96323E97597DDEd'}]){
  const {f,r}=await compose(extra);try{
   assert.match(r.attesterMode,/^ATTESTER_KEY_/);assert.ok(!r.attesterMode.includes('deadbeef'));
   assert.equal(await r.seatAttester.authorizeSend(),false);
   assert.equal((await r.treasury.read('0x'+'ab'.repeat(32),null)).schemaVersion,1);
  }finally{registerTreasuryRuntime(null);f.close();}
 }
});
