import test from 'node:test';
import assert from 'node:assert/strict';
import {SeatAttester} from '../../src/modules/treasury/seat-attestation.mjs';
import {sqlFixture,ventureId,a,txHash} from './service-fixtures.mjs';
test('unconfigured or unrelated receipt never confirms a seat',async()=>{
 const f=sqlFixture();try{
  const port=new SeatAttester({store:f.store});
  assert.equal((await port.confirm({ventureId,wallet:a.address,txHash})).state,'FAILED');
 }finally{f.close();}
});
import {viem,addr,blockHash} from './service-fixtures.mjs';
const {encodeEventTopics,encodeAbiParameters,parseAbi,keccak256}=viem;
function configured(){
 const f=sqlFixture(),registry=addr(500),attester=addr(600),digest=`0x${'77'.repeat(32)}`;let call;
 const eventAbi=parseAbi(['event SeatAttested(bytes32 indexed ventureId,address indexed wallet,bytes32 nullifierHash)']);
 const receipt={status:'success',blockNumber:10n,blockHash,logs:[{address:registry,topics:encodeEventTopics({abi:eventAbi,eventName:'SeatAttested',args:{ventureId,wallet:a.address}}),data:encodeAbiParameters([{type:'bytes32'}],[digest])}]};
 const client={getChainId:async()=>1874,getCode:async({address})=>address.toLowerCase()===registry.toLowerCase()?'0x6000':'0x',readContract:async r=>r.functionName==='attester'?attester:true,call:async()=>({}),getTransactionCount:async()=>2,getTransactionReceipt:async()=>receipt,getTransaction:async()=>({from:attester,to:registry,input:call.data,nonce:2}),getBlockNumber:async()=>11n,getBlock:async()=>({hash:blockHash})};
 const port=new SeatAttester({store:f.store,registry:{address:registry,runtimeCodeHash:keccak256('0x6000')},attester,client,send:async c=>{call=c;return txHash;},authorizeSend:async()=>true,now:()=>123456});
 const input={ventureId,wallet:a.address,nullifierHash:digest};
 return {...f,port,client,receipt,input};
}
test('successful attestation requires exact receipt, two confirmations and independent seat readback',async()=>{
 const f=configured();try{
  assert.deepEqual(await f.port.attestSeat(f.input),{txHash,chainId:1874});
  assert.deepEqual(await f.port.confirm({...f.input,txHash}),{state:'CONFIRMED',chainId:1874,blockNumber:10n,confirmedAt:123456});
  assert.equal(f.db.get('SELECT block_hash FROM treasury_attestations').block_hash,blockHash);
 }finally{f.close();}
});
test('pending, reorged, failed, wrong sender and missing readback cannot confirm',async()=>{
 for(const change of [f=>f.client.getBlockNumber=async()=>10n,f=>f.client.getBlock=async()=>({hash:txHash}),f=>f.receipt.status='reverted',f=>f.client.getTransaction=async()=>({from:addr(1),to:addr(2),input:'0x',nonce:2}),f=>f.client.readContract=async()=>false]){
  const f=configured();try{await f.port.attestSeat(f.input);change(f);assert.notEqual((await f.port.confirm({...f.input,txHash})).state,'CONFIRMED');}finally{f.close();}
 }
});
test('ambiguous attestation and disabled port never automatically retry or send',async()=>{
 const f=configured();try{
  let calls=0;f.port.send=async()=>{calls++;throw new Error('timeout');};
  await assert.rejects(f.port.attestSeat(f.input),/SUBMISSION_UNKNOWN/);
  await assert.rejects(f.port.attestSeat(f.input),/RECONCILIATION/);assert.equal(calls,1);
  f.port.authorizeSend=async()=>false;await assert.rejects(f.port.attestSeat(f.input),/DISABLED/);assert.equal(calls,1);
 }finally{f.close();}
});
