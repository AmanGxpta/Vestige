import {privateKeyToAccount} from 'viem/accounts';
import {toFunctionSelector} from 'viem';
/**
 * H-approved (2026-11-07) server-only attester transport: SeatRegistry.attestSeat on chain 1874 ONLY.
 * Signs locally and submits a raw transaction; the key never leaves this process and is never
 * logged or placed in an error. Every refusal before sendRawTransaction carries preBroadcast:true
 * so SeatAttester can release its reservation; anything after that is UNKNOWN (no retry).
 */
export const ATTESTER_LIMITS=Object.freeze({chainId:1874,maxGas:120000n,maxFeePerGasWei:10_000_000_000n,maxPriorityFeePerGasWei:100_000_000n,gasMarginBps:13000n});
const SELECTOR=toFunctionSelector('attestSeat(bytes32,address,bytes32)');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const refuse=code=>{const e=new Error(code);e.preBroadcast=true;throw e;};
export function createAttesterSigner({privateKey,client,registry,expectedAddress,limits=ATTESTER_LIMITS}){
 let account;
 try{if(typeof privateKey!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(privateKey))throw 0;account=privateKeyToAccount(privateKey);}
 catch{throw new Error('ATTESTER_KEY_INVALID');}
 if(expectedAddress&&!eq(account.address,expectedAddress))throw new Error('ATTESTER_KEY_ADDRESS_MISMATCH');
 if(!registry?.address)throw new Error('ATTESTER_REGISTRY_REQUIRED');
 return {address:account.address,limits,async send({to,data,value,nonce,account:from}){
  if(!eq(to,registry.address))refuse('ATTESTER_TARGET_REFUSED');
  if(typeof data!=='string'||data.length!==2+8+64*3||data.slice(0,10).toLowerCase()!==SELECTOR)refuse('ATTESTER_CALL_REFUSED');
  if(value!==undefined&&value!==0n)refuse('ATTESTER_VALUE_REFUSED');
  if(!eq(from,account.address))refuse('ATTESTER_ACCOUNT_REFUSED');
  if(!Number.isSafeInteger(nonce)||nonce<0)refuse('ATTESTER_NONCE_REFUSED');
  let tx;
  try{
   if(await client.getChainId()!==limits.chainId)refuse('ATTESTER_WRONG_CHAIN');
   const estimate=await client.estimateGas({account:account.address,to,data,value:0n});
   const gas=estimate*limits.gasMarginBps/10000n>limits.maxGas?limits.maxGas:estimate*limits.gasMarginBps/10000n;
   if(estimate>limits.maxGas||gas<estimate)refuse('ATTESTER_GAS_CEILING');
   const base=(await client.getBlock({blockTag:'latest'})).baseFeePerGas;
   let tip=await client.estimateMaxPriorityFeePerGas().catch(()=>1n);if(tip>limits.maxPriorityFeePerGasWei)tip=limits.maxPriorityFeePerGasWei;if(tip<1n)tip=1n;
   if(typeof base!=='bigint'||base+tip>=limits.maxFeePerGasWei)refuse('ATTESTER_FEE_CEILING');
   tx=await account.signTransaction({chainId:limits.chainId,type:'eip1559',to,data,value:0n,nonce,gas,maxFeePerGas:limits.maxFeePerGasWei,maxPriorityFeePerGas:tip});
  }catch(e){if(e?.preBroadcast)throw e;refuse('ATTESTER_PREFLIGHT_FAILED');}
  return client.sendRawTransaction({serializedTransaction:tx});
 }};
}
/** Reads only the locked env name. Returns null (disabled) when unset; never logs the value. */
export function attesterSignerFromEnv(env,{client,registry,expectedAddress}){
 const key=env.VESTIGE_ATTESTER_PRIVATE_KEY;
 if(!key||!registry)return null;
 return createAttesterSigner({privateKey:key,client,registry,expectedAddress});
}
