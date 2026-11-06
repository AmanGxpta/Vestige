import {encodeFunctionData,keccak256,parseAbi,parseEventLogs} from 'viem';
import {fail} from './store.mjs';
const abi=parseAbi(['function attestSeat(bytes32 ventureId,address wallet,bytes32 nullifierHash)','function isSeat(bytes32 ventureId,address wallet) view returns(bool)','function attester() view returns(address)','event SeatAttested(bytes32 indexed ventureId,address indexed wallet,bytes32 nullifierHash)']);
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const bytes32=x=>/^0x[0-9a-f]{64}$/.test(x)&&!/^0x0{64}$/.test(x);
function inputCheck(i){if(!bytes32(i.ventureId)||!/^0x[0-9a-fA-F]{40}$/.test(i.wallet)||/^0x0{40}$/.test(i.wallet))fail('INVALID_SEAT');}
/** Locked SeatAttestationPort. Transport is injected; no key/keystore/password loader. */
export class SeatAttester {
 constructor({store,client,registry,attester,send,authorizeSend=async()=>false,now=()=>Date.now()}){
  Object.assign(this,{store,client,registry,attester,send,authorizeSend,now});
 }
 async attestSeat(input){
  inputCheck(input);if(!bytes32(input.nullifierHash))fail('INVALID_NULLIFIER_DIGEST');
  if(!this.client||!this.registry||!this.send||!await this.authorizeSend())fail('ATTESTATION_DISABLED',503);
  if(await this.client.getChainId()!==1874)fail('WRONG_CHAIN',503);
  const code=await this.client.getCode({address:this.registry.address});
  if(!code||keccak256(code)!==this.registry.runtimeCodeHash)fail('REGISTRY_DRIFT',503);
  if(!eq(await this.client.readContract({address:this.registry.address,abi,functionName:'attester'}),this.attester))fail('WRONG_ATTESTER',503);
  const walletCode=await this.client.getCode({address:input.wallet});if(walletCode&&walletCode!=='0x')fail('EOA_REQUIRED');
  const db=this.store.db;const wallet=input.wallet.toLowerCase();
  const prior=db.get('SELECT * FROM treasury_attestations WHERE venture_id=? AND wallet=?',input.ventureId,wallet);
  if(prior){if(prior.nullifier_hash!==input.nullifierHash)fail('SEAT_INTENT_CONFLICT',409);
   if(prior.tx_hash)return {txHash:prior.tx_hash,chainId:1874};fail('ATTESTATION_RECONCILIATION_REQUIRED',409);}
  const data=encodeFunctionData({abi,functionName:'attestSeat',args:[input.ventureId,wallet,input.nullifierHash]});
  await this.client.call({to:this.registry.address,data,account:this.attester,value:0n});
  const nonce=await this.client.getTransactionCount({address:this.attester,blockTag:'pending'});
  if(nonce!==await this.client.getTransactionCount({address:this.attester,blockTag:'latest'}))fail('ATTESTER_NONCE_LOCK',409);
  db.tx(()=>{
   if(db.get("SELECT 1 FROM treasury_attestations WHERE status IN ('RESERVED','UNKNOWN','SUBMITTED')"))fail('ATTESTER_NONCE_LOCK',409);
   try{db.run('INSERT INTO treasury_attestations(venture_id,wallet,nullifier_hash,status,sender,sender_nonce,call_hash) VALUES(?,?,?,?,?,?,?)',input.ventureId,wallet,input.nullifierHash,'RESERVED',this.attester,String(nonce),keccak256(data));}
   catch(e){if(e.code)throw e;fail('DUPLICATE_SEAT_DIGEST',409);}
  });
  try{
   const txHash=await this.send({to:this.registry.address,data,value:0n,nonce,account:this.attester});
   if(!/^0x[0-9a-fA-F]{64}$/.test(txHash))throw new Error('INVALID_HASH');
   db.run('UPDATE treasury_attestations SET status=?,tx_hash=? WHERE venture_id=? AND wallet=?','SUBMITTED',txHash,input.ventureId,wallet);
   return {txHash,chainId:1874};
  }catch{db.run('UPDATE treasury_attestations SET status=? WHERE venture_id=? AND wallet=?','UNKNOWN',input.ventureId,wallet);fail('ATTESTATION_SUBMISSION_UNKNOWN',503);}
 }
 async confirm(input){
  try{inputCheck(input);}catch{return {state:'FAILED',reason:'INVALID_SEAT'};}
  if(!this.store||!this.client||!this.registry)return {state:'FAILED',reason:'ATTESTATION_UNCONFIGURED'};
  const row=this.store.db.get('SELECT * FROM treasury_attestations WHERE venture_id=? AND wallet=? AND tx_hash=?',input.ventureId,input.wallet.toLowerCase(),input.txHash);
  if(!row)return {state:'FAILED',reason:'UNRELATED_ATTESTATION'};
  try{
   if(await this.client.getChainId()!==1874)return {state:'FAILED',reason:'WRONG_CHAIN'};
   const receipt=await this.client.getTransactionReceipt({hash:input.txHash});
   if(await this.client.getBlockNumber({cacheTime:0})<receipt.blockNumber+1n)return {state:'PENDING'};
   const block=await this.client.getBlock({blockNumber:receipt.blockNumber});
   if(!eq(block.hash,receipt.blockHash))return {state:'PENDING'};
   const tx=await this.client.getTransaction({hash:input.txHash});
   if(!eq(tx.from,row.sender)||!eq(tx.to,this.registry.address)||keccak256(tx.input)!==row.call_hash||String(tx.nonce)!==row.sender_nonce)return {state:'FAILED',reason:'ATTESTATION_TX_MISMATCH'};
   if(receipt.status!=='success'){this.store.db.run('UPDATE treasury_attestations SET status=? WHERE tx_hash=?','FAILED',input.txHash);return {state:'FAILED',reason:'ATTESTATION_REVERTED'};}
   const event=parseEventLogs({abi,logs:receipt.logs,strict:true}).some(l=>eq(l.address,this.registry.address)&&l.args.ventureId===input.ventureId&&eq(l.args.wallet,input.wallet)&&l.args.nullifierHash===row.nullifier_hash);
   const code=await this.client.getCode({address:this.registry.address,blockNumber:receipt.blockNumber});
   const seat=event&&code&&keccak256(code)===this.registry.runtimeCodeHash&&await this.client.readContract({address:this.registry.address,abi,functionName:'isSeat',args:[input.ventureId,input.wallet],blockNumber:receipt.blockNumber});
   if(seat!==true)return {state:'FAILED',reason:'SEAT_READBACK_MISMATCH'};
   const confirmedAt=this.now();this.store.db.run('UPDATE treasury_attestations SET status=?,block_number=?,block_hash=?,confirmed_at=? WHERE tx_hash=?','CONFIRMED',String(receipt.blockNumber),receipt.blockHash,confirmedAt,input.txHash);
   return {state:'CONFIRMED',chainId:1874,blockNumber:receipt.blockNumber,confirmedAt};
  }catch{return {state:'PENDING'};}
 }
}
