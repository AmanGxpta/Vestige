import {fundingRelayId,paymentRelayId} from '../relayer/relayer.mjs';
import {randomUUID} from 'node:crypto';
import {recoverTypedDataAddress,hashTypedData} from 'viem';
import {fail} from './store.mjs';
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const raw=x=>{if(typeof x!=='string'||! /^(0|[1-9][0-9]{0,77})$/.test(x)||BigInt(x)>=2n**256n)fail('INVALID_AMOUNT');return BigInt(x);};
const addr=x=>{if(!/^0x[0-9a-fA-F]{40}$/.test(x)||/^0x0{40}$/.test(x))fail('INVALID_ADDRESS');return x.toLowerCase();};
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
export class TreasuryService {
 constructor({store,relay,manifests=[],readConfirmedSeats}){Object.assign(this,{store,relay,manifests,readConfirmedSeats});}
 async context(id,actor){if(actor&&!this.store.seats(id).some(s=>eq(s.wallet,actor)&&s.world_status==='VERIFIED'&&s.onchain_status==='VERIFIED'))fail('VERIFIED_FOUNDER_REQUIRED',403);const c=await this.relay.context(id);if(actor&&!c.state.owners.some(o=>eq(o,actor)))fail('NOT_CURRENT_OWNER',403);return c;}
 async read(id,actor){
  await this.reconcileOperations(id);
  const payments=this.store.db.all('SELECT payment_id,recipient,amount_raw,status,reason,safe_nonce FROM treasury_payments WHERE venture_id=? ORDER BY created_at',id);
  const m=this.manifests.find(m=>m.ventureId===id);
  if(!m)return {ventureId:id,verificationStatus:'UNKNOWN',manifest:null,payments:[],operations:actor&&this.store.seats(id).some(s=>eq(s.wallet,actor))?this.store.operations(id):[]};
  let c;try{c=await this.context(id);}catch{return {ventureId:id,verificationStatus:'UNVERIFIED',manifest:m,payments:[],operations:actor?this.store.operations(id):[]};}
  const owner=actor&&c.state.owners.some(o=>eq(o,actor))&&this.store.seats(id).some(s=>eq(s.wallet,actor)&&s.world_status==='VERIFIED'&&s.onchain_status==='VERIFIED');
  const pending=payments.map(p=>({paymentId:p.payment_id,recipient:p.recipient,amountRaw:p.amount_raw,status:p.status,...(owner?{reason:p.reason}:{}),...(p.safe_nonce!==String(c.state.nonce)&&p.status!=='EXECUTED'?{status:'FAILED'}:{})}));
  return {ventureId:id,safeAddress:m.contracts.safe.address,chainId:1874,ownerAddresses:c.state.owners,threshold:2,guardAddress:m.contracts.guard.address,registryAddress:m.contracts.registry.address,
   verificationStatus:'ACTIVE',deploymentTxHash:m.contracts.safe.deploymentTxHash,deploymentBlock:m.deploymentBlock,manifest:m,
   provenance:{blockNumber:String(c.state.blockNumber),blockHash:c.state.blockHash,source:this.store.source(id)},payments:pending,operations:owner?this.store.operations(id):actor?this.store.operations(id,actor):[]};
 }
 payment(id,pid){const p=this.store.db.get('SELECT * FROM treasury_payments WHERE payment_id=? AND venture_id=?',pid,id);if(!p)fail('PAYMENT_NOT_FOUND',404);return p;}
 async currentPayment(id,pid,actor){const p=this.payment(id,pid),c=await this.context(id,actor);
  if(['EXECUTED','FAILED'].includes(p.status))fail('PAYMENT_NOT_SIGNABLE',409);
  if(p.safe_nonce!==String(c.state.nonce)){this.store.db.tx(()=>{this.store.db.run('UPDATE treasury_payments SET status=? WHERE payment_id=?','FAILED',pid);this.store.db.run('DELETE FROM treasury_signatures WHERE payment_id=?',pid);});fail('STALE_SAFE_NONCE',409);}
  return {p,c};
 }
 async mutate(action,{id,pid,actor,body,operationId}){
  const db=this.store.db;
  if(action==='deploy'){
   const seats=this.store.seats(id);
   if(seats.length!==2||seats.some(s=>s.world_status!=='VERIFIED'||s.onchain_status!=='VERIFIED')||!this.readConfirmedSeats||!await this.readConfirmedSeats(id,seats.map(s=>s.wallet)))fail('TWO_CONFIRMED_SEATS_REQUIRED',409);
   db.run('INSERT INTO treasury_deployment_requests VALUES(?,?,?,?,?,?,?)',operationId,id,seats[0].wallet,seats[1].wallet,2,this.store.source(id),Date.now());
   // A request is preparation only. No deployer or factory transport is available here.
   return {operationId,status:'RESERVED',error:{code:'HUMAN_APPROVAL_REQUIRED',message:'Deployment preparation only. No transaction authorized.'}};
  }
  if(action==='fund'){
   if(!eq(body.from,actor))fail('PAYER_SESSION_MISMATCH',403);
   const request={...body,ventureId:id,from:addr(body.from),to:addr(body.to),value:raw(body.value),validAfter:raw(body.validAfter),validBefore:raw(body.validBefore)};
   db.run('UPDATE treasury_operations SET relay_id=? WHERE operation_id=?',fundingRelayId(request.from,request.nonce),operationId);
   const result=await this.relay.fund(request);return this.record(operationId,result);
  }
  if(action==='payments'){
   const c=await this.context(id,actor);const recipient=addr(body.recipient),amount=raw(body.amountRaw);
   if(amount===0n||typeof body.reason!=='string'||body.reason.length>500||body.reason.trim().length===0)fail('INVALID_PAYMENT');
   const paymentId=randomUUID();const typed=this.relay.paymentTyped({recipient,amount,nonce:c.state.nonce},c.manifest);const safeTxHash=hashTypedData(typed);
   try{db.run('INSERT INTO treasury_payments VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',paymentId,id,recipient,String(amount),body.reason,String(c.state.nonce),safeTxHash,json(typed),actor,'AWAITING_APPROVALS',null,Date.now());}
   catch(e){if(String(e.message).includes('UNIQUE'))fail('SAFE_NONCE_ALREADY_PROPOSED',409);throw e;}
   return {operationId,paymentId,ventureId:id,safeTxHash,safeNonce:String(c.state.nonce),typedData:JSON.parse(json(typed)),status:'AWAITING_APPROVALS'};
  }
  const {p,c}=await this.currentPayment(id,pid,actor);
  if(action==='sign'){
   if(!/^0x[0-9a-fA-F]{130}$/.test(body.signature))fail('INVALID_SIGNATURE');
   let signer;try{signer=await recoverTypedDataAddress({...JSON.parse(p.typed_json),signature:body.signature});}catch{fail('INVALID_SIGNATURE');}
   if(!eq(signer,actor)||!c.state.owners.some(o=>eq(o,signer)))fail('SIGNER_SESSION_MISMATCH',403);
   const result=db.tx(()=>{
    db.run('INSERT INTO treasury_signatures VALUES(?,?,?,?) ON CONFLICT(payment_id,signer) DO UPDATE SET signature=excluded.signature',pid,actor,body.signature,Date.now());
    const signerWallets=db.all('SELECT signer FROM treasury_signatures WHERE payment_id=?',pid).map(r=>r.signer);
    const status=signerWallets.length===2?'READY':'AWAITING_APPROVALS';db.run('UPDATE treasury_payments SET status=? WHERE payment_id=?',status,pid);return {status,signerWallets};
   });return {operationId,paymentId:pid,safeTxHash:p.safe_tx_hash,...result};
  }
  if(action==='execute'){
   if(p.operation_id&&['RESERVED','UNKNOWN','SUBMITTED'].includes(db.get('SELECT status FROM treasury_operations WHERE operation_id=?',p.operation_id)?.status))fail('PAYMENT_EXECUTION_PENDING',409);
   const signatures=db.all('SELECT signature FROM treasury_signatures WHERE payment_id=?',pid).map(s=>s.signature);
   if(p.status!=='READY'||signatures.length!==2)fail('TWO_SIGNATURES_REQUIRED',409);
   db.run('UPDATE treasury_operations SET relay_id=? WHERE operation_id=?',paymentRelayId(c.manifest.safe,p.safe_nonce),operationId);
   db.run('UPDATE treasury_payments SET operation_id=? WHERE payment_id=?',operationId,pid);
   const result=await this.relay.execute({ventureId:id,recipient:p.recipient,amount:BigInt(p.amount_raw),nonce:BigInt(p.safe_nonce),signatures});
   db.run('UPDATE treasury_payments SET operation_id=? WHERE payment_id=?',operationId,pid);return this.record(operationId,result);
  }
  fail('UNKNOWN_ACTION',404);
 }
 record(operationId,result){this.store.db.run('UPDATE treasury_operations SET status=?,relay_id=?,tx_hash=? WHERE operation_id=?',result.status,result.id,result.hash||null,operationId);return {operationId,status:result.status,...(result.hash?{txHash:result.hash}:{})};}
 async reconcileOperations(id){
  for(const op of this.store.db.all("SELECT * FROM treasury_operations WHERE venture_id=? AND status IN ('SUBMITTED','UNKNOWN') AND relay_id IS NOT NULL",id)){
   let result;try{result=await this.relay.confirm(op.relay_id);}catch{continue;}
   if(!['EXECUTED','FAILED'].includes(result.status))continue;
   this.store.db.tx(()=>{
    this.store.db.run('UPDATE treasury_operations SET status=?,tx_hash=?,block_number=?,block_hash=?,confirmed_at=?,error_code=? WHERE operation_id=?',result.status,result.hash||op.tx_hash||null,result.blockNumber||null,result.blockHash||null,Date.now(),result.error||null,op.operation_id);
    this.store.db.run('UPDATE treasury_payments SET status=? WHERE operation_id=?',result.status,op.operation_id);
    this.store.settle(op.operation_id,{operationId:op.operation_id,status:result.status,...(result.hash||op.tx_hash?{txHash:result.hash||op.tx_hash}:{}),...(result.error?{error:{code:result.error,message:result.error}}:{})});
   });
  }
 }
}
