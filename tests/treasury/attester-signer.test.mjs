import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttesterSigner,ATTESTER_LIMITS} from '../../src/modules/treasury/attester-signer.mjs';
import {SeatAttester} from '../../src/modules/treasury/seat-attestation.mjs';
import {sqlFixture,ventureId,a,viem,addr,txHash} from './service-fixtures.mjs';
const {encodeFunctionData,parseAbi,keccak256,parseTransaction,recoverTransactionAddress}=viem;
// Test-only throwaway scalar. Never a Vestige key.
const KEY='0x59c6995e998f97a5a0044966f0b8d6a7c84b0a1dec3e4b2bc6b3e3e5a6b7d8e9';
const abi=parseAbi(['function attestSeat(bytes32 ventureId,address wallet,bytes32 nullifierHash)']);
const registry=addr(500),digest=`0x${'77'.repeat(32)}`;
const data=()=>encodeFunctionData({abi,functionName:'attestSeat',args:[ventureId,a.address.toLowerCase(),digest]});
function client(over={}){
 const sent=[];
 return {sent,getChainId:async()=>1874,estimateGas:async()=>70503n,getBlock:async()=>({baseFeePerGas:5_000_000_000n}),
  estimateMaxPriorityFeePerGas:async()=>1n,sendRawTransaction:async({serializedTransaction})=>{sent.push(serializedTransaction);return txHash;},...over};
}
async function signer(over={},opts={}){
 const c=client(over);const s=createAttesterSigner({privateKey:KEY,client:c,registry:{address:registry},...opts});
 return {c,s};
}
test('attester signer signs only the exact registry attestSeat call on 1874 with bounded gas and fee',async()=>{
 const {c,s}=await signer();
 assert.equal(await s.send({to:registry,data:data(),value:0n,nonce:0,account:s.address}),txHash);
 assert.equal(c.sent.length,1);const tx=parseTransaction(c.sent[0]);
 assert.equal(tx.chainId,1874);assert.equal(tx.to.toLowerCase(),registry.toLowerCase());assert.equal(tx.value??0n,0n);assert.equal(tx.data,data());
 assert.ok(tx.gas<=ATTESTER_LIMITS.maxGas&&tx.gas>=70503n);assert.ok(tx.maxFeePerGas<=ATTESTER_LIMITS.maxFeePerGasWei);
 assert.equal((await recoverTransactionAddress({serializedTransaction:c.sent[0]})).toLowerCase(),s.address.toLowerCase());
});
test('attester signer refuses every other target, selector, value, length, account, chain, gas and fee before broadcast',async()=>{
 const other=encodeFunctionData({abi:parseAbi(['function transfer(address,uint256)']),functionName:'transfer',args:[addr(1),1n]});
 const cases=[
  [{},{to:addr(501)}],[{},{data:other}],[{},{data:data()+'00'}],[{},{value:1n}],[{},{account:addr(9)}],[{},{nonce:-1}],
  [{getChainId:async()=>1}],[{estimateGas:async()=>ATTESTER_LIMITS.maxGas+1n}],[{getBlock:async()=>({baseFeePerGas:ATTESTER_LIMITS.maxFeePerGasWei})}],
 ];
 for(const [over,callOver={}] of cases){
  const {c,s}=await signer(over);
  await assert.rejects(s.send({to:registry,data:data(),value:0n,nonce:0,account:s.address,...callOver}),e=>e.preBroadcast===true&&/^ATTESTER_/.test(e.message));
  assert.equal(c.sent.length,0);
 }
});
test('invalid or mismatched attester key fails closed without echoing key material',async()=>{
 for(const opts of [{privateKey:'0x1234'},{privateKey:'not-a-key'},{expectedAddress:addr(9)}]){
  let msg='';try{createAttesterSigner({privateKey:KEY,client:client(),registry:{address:registry},...opts});}catch(e){msg=e.message+String(e.stack);}
  assert.match(msg,/ATTESTER_KEY/);assert.ok(!msg.includes(KEY.slice(2,20))&&!msg.includes('1234')&&!msg.includes('not-a-key'));
 }
});
test('pre-broadcast refusal releases the reservation; a broadcast failure stays UNKNOWN',async()=>{
 const f=sqlFixture();try{
  const code='0x6000';let reject=true,broadcasts=0;
  const c={getChainId:async()=>1874,getCode:async({address})=>address.toLowerCase()===registry.toLowerCase()?code:'0x',readContract:async()=>undefined,call:async()=>({}),getTransactionCount:async()=>0};
  const send=async()=>{if(reject){const e=new Error('ATTESTER_GAS_CEILING');e.preBroadcast=true;throw e;}broadcasts++;throw new Error('timeout');};
  const port=new SeatAttester({store:f.store,client:c,registry:{address:registry,runtimeCodeHash:keccak256(code)},attester:addr(600),send,authorizeSend:async()=>true});
  c.readContract=async()=>addr(600);
  const input={ventureId,wallet:a.address,nullifierHash:digest};
  await assert.rejects(port.attestSeat(input),/ATTESTER_GAS_CEILING/);
  assert.equal(f.db.get('SELECT count(*) n FROM treasury_attestations').n,0);
  reject=false;await assert.rejects(port.attestSeat(input),/SUBMISSION_UNKNOWN/);assert.equal(broadcasts,1);
  assert.equal(f.db.get('SELECT status FROM treasury_attestations').status,'UNKNOWN');
 }finally{f.close();}
});
