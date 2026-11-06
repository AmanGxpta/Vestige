/** CR-X-002 draft projection; intentionally not installed in production runtime pending H acceptance. */
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const copy=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
export function paymentCreatedV1(result){
 if(!result.typedData)return result;
 const {typedData,...rest}=result;return {...rest,safeTypedData:typedData,signerWallets:[]};
}
export async function treasuryReadV1(service,id,actor){
 await service.reconcileOperations(id);
 const m=service.manifests.find(x=>x.ventureId===id);
 const empty={schemaVersion:1,ventureId:id,verificationStatus:m?'UNVERIFIED':'UNKNOWN',treasury:null,balanceRaw:null,tokenDecimals:null,depositsStatus:'UNKNOWN',deposits:[],payments:[],evidence:[],manifest:m||null,provenance:null,operations:[],source:'API'};
 if(!m)return empty;
 let c;try{c=await service.context(id);}catch{return empty;}
 if(c.state.blockNumber===undefined||!/^0x[0-9a-fA-F]{64}$/.test(c.state.blockHash||''))return empty;
 const owner=actor&&c.state.owners.some(o=>eq(o,actor))&&service.store.seats(id).some(s=>eq(s.wallet,actor)&&s.world_status==='VERIFIED'&&s.onchain_status==='VERIFIED');
 let chain={balanceRaw:null,tokenDecimals:null,depositsStatus:'UNKNOWN',deposits:[],evidence:[]};
 if(service.readPort){try{chain=await service.readPort.read({manifest:m,context:c});}catch(e){if(e.message==='READBACK_REORG')return empty;/* Unknown balance/history is not zero. */}}
 const db=service.store.db,payments=[];
 if(owner)for(const p of db.all('SELECT * FROM treasury_payments WHERE venture_id=? ORDER BY created_at',id)){
  const terminal=['EXECUTED','FAILED'].includes(p.status),fresh=p.safe_nonce===String(c.state.nonce);
  let signers=db.all('SELECT signer FROM treasury_signatures WHERE payment_id=? ORDER BY signer',p.payment_id).map(r=>r.signer);
  if(!terminal)signers=fresh?signers.filter(s=>c.state.owners.some(o=>eq(o,s))):[];
  const status=terminal?p.status:!fresh?'FAILED':signers.length===2?'READY':'AWAITING_APPROVALS';
  const op=p.operation_id?db.get('SELECT * FROM treasury_operations WHERE operation_id=?',p.operation_id):null;
  payments.push({paymentId:p.payment_id,ventureId:id,safeTxHash:p.safe_tx_hash,recipient:p.recipient,tokenAddress:m.contracts.token.address,amountRaw:p.amount_raw,reason:p.reason,
   signerWallets:signers,status,safeNonce:p.safe_nonce,safeTypedData:fresh&&!terminal?JSON.parse(p.typed_json):null,
   relay:op?{operationId:op.operation_id,status:op.status,...(op.tx_hash?{txHash:op.tx_hash}:{}),...(op.error_code?{error:op.error_code}:{})}:null,
   executedTxHash:p.status==='EXECUTED'&&op?.tx_hash?op.tx_hash:null});
 }
 const operations=(owner?service.store.operations(id):actor?service.store.operations(id,actor):[]).map(op=>Object.fromEntries(Object.entries(op).filter(([,value])=>value!==null&&value!==undefined)));
 return copy({...empty,verificationStatus:'ACTIVE',treasury:{ventureId:id,safeAddress:m.contracts.safe.address,chainId:1874,ownerAddresses:c.state.owners,threshold:2,guardAddress:m.contracts.guard.address,registryAddress:m.contracts.registry.address,verificationStatus:'ACTIVE',deploymentTxHash:m.contracts.safe.deploymentTxHash,deploymentBlock:String(m.deploymentBlock)},
  ...chain,payments,provenance:{chainId:1874,blockNumber:String(c.state.blockNumber),blockHash:c.state.blockHash,observedAt:new Date().toISOString(),source:service.store.source(id)},operations});
}
