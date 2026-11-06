import test from 'node:test';
import assert from 'node:assert/strict';
import {TreasuryChainReadPort} from '../../src/modules/treasury/readback-port.mjs';
import {sqlFixture,manifestFixture,viem,txHash,a} from './service-fixtures.mjs';
const {parseAbi,encodeEventTopics,encodeAbiParameters,encodeFunctionData}=viem;
const hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function setup(){
 const f=sqlFixture(),m=manifestFixture(),calls=[];let broken=false;
 const canonical=n=>({hash:broken&&n===9n?hash(999):hash(n),number:n,timestamp:1000n+n});
 const event=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 const log={address:m.contracts.token.address,args:{from:a.address,to:m.contracts.safe.address,value:100n},blockNumber:5n,blockHash:hash(5),transactionHash:txHash,logIndex:0,removed:false,data:encodeAbiParameters([{type:'uint256'}],[100n]),topics:encodeEventTopics({abi:event,eventName:'Transfer',args:{from:a.address,to:m.contracts.safe.address}})};
 const client={getChainId:async()=>1874,readContract:async r=>r.functionName==='decimals'?6:100n,getBlockNumber:async()=>10n,getBlock:async r=>canonical(r.blockNumber),getLogs:async r=>{calls.push([r.fromBlock,r.toBlock]);return r.fromBlock<=5n&&r.toBlock>=5n?[log]:[];},getTransactionReceipt:async()=>({status:'success',blockNumber:5n,blockHash:hash(5),logs:[log]})};
 const port=new TreasuryChainReadPort({store:f.store,client,windowSize:3,maxWindowsPerRead:1});
 return {...f,m,client,port,log,calls,reorg:()=>{broken=true;},context:{state:{blockNumber:10n}}};
}
test('deposit history paginates from creation, uses receipt-bound logs, and resumes after reload',async()=>{
 const f=setup();try{
  assert.equal((await f.port.read({manifest:f.m,context:f.context})).depositsStatus,'PENDING');
  const p2=await f.port.read({manifest:f.m,context:f.context});assert.equal(p2.deposits[0].amountRaw,'100');assert.equal(p2.depositsStatus,'PENDING');
  const p3=await new TreasuryChainReadPort({store:f.store,client:f.client,windowSize:3,maxWindowsPerRead:1}).read({manifest:f.m,context:f.context});assert.equal(p3.depositsStatus,'VERIFIED');assert.equal(p3.balanceRaw,'100');
  assert.deepEqual(f.calls,[[1n,3n],[4n,6n],[7n,9n]]);assert.deepEqual(p3.evidence,[]);
  f.reorg();const again=await f.port.read({manifest:f.m,context:f.context});assert.equal(again.depositsStatus,'PENDING');assert.equal(again.deposits.length,0);
 }finally{f.close();}
});
test('unknown balance and bad receipts never become zero or a verified deposit',async()=>{
 const f=setup();try{
  f.client.readContract=async()=>{throw new Error('RPC unavailable');};await f.port.read({manifest:f.m,context:f.context});
  f.client.getTransactionReceipt=async()=>({status:'reverted',blockNumber:5n,blockHash:hash(5),logs:[]});
  const r=await f.port.read({manifest:f.m,context:f.context});assert.equal(r.balanceRaw,null);assert.equal(r.tokenDecimals,null);assert.equal(r.depositsStatus,'UNKNOWN');assert.deepEqual(r.deposits,[]);
 }finally{f.close();}
});
test('simulation/no mined trace cannot create a GS020 evidence record',async()=>{
 const f=setup();try{
  await assert.rejects(f.port.recordRejectedAttempt({manifest:f.m,txHash,review:{approved:true,reference:'LOCAL_TEST'}}),/MINED_REJECTION/);
  assert.deepEqual(await f.port.evidence(f.m,10n),[]);
 }finally{f.close();}
});
test('only a canonical failed receipt with an actual transaction trace can publish rejected evidence',async()=>{
 const f=setup();try{
  const abi=parseAbi(['function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)']);
  const input=encodeFunctionData({abi,functionName:'execTransaction',args:[f.m.contracts.token.address,0n,'0x',0,0n,0n,0n,'0x'+'0'.repeat(40),'0x'+'0'.repeat(40),'0x'+'11'.repeat(65)]});
  const output='0x08c379a0'+encodeAbiParameters([{type:'string'}],['GS020']).slice(2);
  f.client.getTransaction=async()=>({to:f.m.contracts.safe.address,value:0n,input});
  f.client.getTransactionReceipt=async()=>({status:'reverted',blockNumber:5n,blockHash:hash(5),logs:[]});
  f.client.request=async()=>({to:f.m.contracts.safe.address,input,output,error:'execution reverted'});
  await f.port.recordRejectedAttempt({manifest:f.m,txHash,review:{approved:true,reference:'MOCK_TRACE_ONLY'}});
  const evidence=await f.port.evidence(f.m,10n);assert.equal(evidence[0].reasonSource,'MINED_TRACE');assert.equal(evidence[0].revertReason,'GS020');
  f.client.request=async()=>{throw new Error('Trace unavailable');};assert.deepEqual(await f.port.evidence(f.m,10n),[]);
 }finally{f.close();}
});
test('a reorg during a read invalidates the entire balance and deposit projection',async()=>{
 const f=setup();try{
  f.context.state.blockHash='0x'+(10n).toString(16).padStart(64,'0');
  const get=f.client.getBlock;let headReads=0;
  f.client.getBlock=async r=>r.blockNumber===10n&&++headReads>1?{hash:'0x'+'77'.repeat(32)}:get(r);
  await assert.rejects(f.port.read({manifest:f.m,context:f.context}),/READBACK_REORG/);
 }finally{f.close();}
});
