import {parseAbi,keccak256,decodeFunctionData,decodeErrorResult} from 'viem';
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const safeAbi=parseAbi(['function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)']);
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const min=(a,b)=>a<b?a:b;
/** Read-only chain/cache port. It has no signing/broadcast method. */
export class TreasuryChainReadPort {
 constructor({client,store,windowSize=10000,maxWindowsPerRead=4}){
  if(!Number.isSafeInteger(windowSize)||windowSize<1||windowSize>10000||!Number.isSafeInteger(maxWindowsPerRead)||maxWindowsPerRead<1)throw new Error('INVALID_LOG_WINDOW');
  Object.assign(this,{client,store,windowSize,maxWindowsPerRead});
 }
 async read({manifest,context}){
  if(await this.client.getChainId()!==1874)throw new Error('WRONG_CHAIN');
  const target=manifest.contracts.safe.address,token=manifest.contracts.token.address,block=context.state.blockNumber;
  if(context.state.blockHash&&(await this.client.getBlock({blockNumber:block})).hash.toLowerCase()!==context.state.blockHash.toLowerCase())throw new Error('READBACK_REORG');
  let balanceRaw=null,tokenDecimals=null;
  try{
   const [balance,decimals]=await Promise.all([this.client.readContract({address:token,abi,functionName:'balanceOf',args:[target],blockNumber:block}),this.client.readContract({address:token,abi,functionName:'decimals',blockNumber:block})]);
   if(decimals!==6&&decimals!==6n)throw new Error('TOKEN_DECIMALS_DRIFT');balanceRaw=String(balance);tokenDecimals=6;
  }catch{/* A failed read is unknown, not zero. */}
  let depositsStatus='UNKNOWN';try{depositsStatus=await this.scan(manifest,block);}catch{/* Preserve verified records, but never call incomplete history complete. */}
  const deposits=[];
  for(const r of this.store.db.all('SELECT * FROM treasury_deposits WHERE venture_id=? ORDER BY CAST(block_number AS INTEGER),log_index',manifest.ventureId)){
   if(eq((await this.client.getBlock({blockNumber:BigInt(r.block_number)})).hash,r.block_hash))deposits.push({from:r.from_address,amountRaw:r.amount_raw,txHash:r.tx_hash,status:'VERIFIED',blockNumber:r.block_number,blockHash:r.block_hash,logIndex:r.log_index,confirmedAt:r.confirmed_at});
  }
  const evidence=await this.evidence(manifest,block);
  if(context.state.blockHash&&!eq((await this.client.getBlock({blockNumber:block})).hash,context.state.blockHash))throw new Error('READBACK_REORG');
  return {balanceRaw,tokenDecimals,depositsStatus,deposits,evidence};
 }
 async scan(m,head){
  const id=m.ventureId,token=m.contracts.token.address,safe=m.contracts.safe.address,db=this.store.db,start=BigInt(m.deploymentBlock),last=head-1n;
  if(last<start)return 'PENDING';
  let checkpoint=db.get('SELECT * FROM treasury_deposit_scan WHERE venture_id=?',id);
  if(checkpoint){const canonical=await this.client.getBlock({blockNumber:BigInt(checkpoint.scanned_through)});
   if(!eq(checkpoint.token_address,token)||!eq(checkpoint.safe_address,safe)||checkpoint.deployment_block!==String(start)||!eq(canonical.hash,checkpoint.block_hash)){
    db.tx(()=>{db.run('DELETE FROM treasury_deposits WHERE venture_id=?',id);db.run('DELETE FROM treasury_deposit_scan WHERE venture_id=?',id);});checkpoint=null;
   }
  }
  let from=checkpoint?BigInt(checkpoint.scanned_through)+1n:start;
  for(let page=0;page<this.maxWindowsPerRead&&from<=last;page++){
   const to=min(from+BigInt(this.windowSize)-1n,last);
   const logs=await this.client.getLogs({address:token,event:abi.find(e=>e.type==='event'),args:{to:safe},fromBlock:from,toBlock:to,strict:true});
   const records=[];
   for(const log of logs){
    if(!eq(log.address,token)||!eq(log.args?.to,safe)||log.removed||log.blockNumber<from||log.blockNumber>to)throw new Error('TRANSFER_LOG_MISMATCH');
    const receipt=await this.client.getTransactionReceipt({hash:log.transactionHash});const canonical=await this.client.getBlock({blockNumber:log.blockNumber});
    if(receipt.status!=='success'||!eq(receipt.blockHash,canonical.hash)||!eq(log.blockHash,canonical.hash)||receipt.blockNumber!==log.blockNumber||!receipt.logs.some(l=>l.logIndex===log.logIndex&&eq(l.address,token)&&eq(l.data,log.data)&&l.topics.length===log.topics.length&&l.topics.every((t,i)=>eq(t,log.topics[i]))))throw new Error('TRANSFER_RECEIPT_UNVERIFIED');
    records.push([id,log.transactionHash,Number(log.logIndex),log.args.from.toLowerCase(),String(log.args.value),String(log.blockNumber),canonical.hash,new Date(Number(canonical.timestamp)*1000).toISOString()]);
   }
   const through=await this.client.getBlock({blockNumber:to});
   db.tx(()=>{for(const row of records)db.run('INSERT OR REPLACE INTO treasury_deposits VALUES(?,?,?,?,?,?,?,?)',...row);db.run('INSERT OR REPLACE INTO treasury_deposit_scan VALUES(?,?,?,?,?,?)',id,token,safe,String(start),String(to),through.hash);});
   from=to+1n;
  }
  return from>last?'VERIFIED':'PENDING';
 }
 async rejectedProof(m,hash,head){
  const receipt=await this.client.getTransactionReceipt({hash});
  if(receipt.status!=='reverted'||receipt.blockNumber+1n>head)throw new Error('MINED_REJECTION_REQUIRED');
  const block=await this.client.getBlock({blockNumber:receipt.blockNumber});if(!eq(block.hash,receipt.blockHash))throw new Error('RECEIPT_REORG');
  const tx=await this.client.getTransaction({hash});if(!eq(tx.to,m.contracts.safe.address)||tx.value!==0n)throw new Error('WRONG_REJECTED_TARGET');
  const decoded=decodeFunctionData({abi:safeAbi,data:tx.input});if(decoded.functionName!=='execTransaction'||decoded.args[9].length!==132)throw new Error('NOT_ONE_SIGNATURE');
  const trace=await this.client.request({method:'debug_traceTransaction',params:[hash,{tracer:'callTracer'}]});
  const error=decodeErrorResult({abi:parseAbi(['error Error(string)']),data:trace.output});
  if(!trace.error||!eq(trace.to,m.contracts.safe.address)||!eq(trace.input,tx.input)||error.errorName!=='Error'||error.args[0]!=='GS020')throw new Error('MINED_GS020_TRACE_REQUIRED');
  return {receipt,block,tx,trace};
 }
 /** Operator-only ingestion after separately approved failed transaction; never sends one. */
 async recordRejectedAttempt({manifest,txHash,review}){
  if(review?.approved!==true||!review.reference)throw new Error('OPERATOR_REVIEW_REQUIRED');
  if(await this.client.getChainId()!==1874)throw new Error('WRONG_CHAIN');
  const p=await this.rejectedProof(manifest,txHash,await this.client.getBlockNumber({cacheTime:0}));
  this.store.db.run('INSERT OR REPLACE INTO treasury_rejected_evidence VALUES(?,?,?,?,?,?,?,?,?)',manifest.ventureId,txHash,manifest.contracts.safe.address,keccak256(p.tx.input),String(p.receipt.blockNumber),p.block.hash,new Date(Number(p.block.timestamp)*1000).toISOString(),keccak256(p.trace.output),review.reference);
 }
 async evidence(m,head){
  const out=[];
  for(const row of this.store.db.all('SELECT * FROM treasury_rejected_evidence WHERE venture_id=?',m.ventureId)){
   try{const p=await this.rejectedProof(m,row.tx_hash,head);
    if(!eq(p.receipt.blockHash,row.block_hash)||!eq(keccak256(p.tx.input),row.call_hash)||!eq(keccak256(p.trace.output),row.trace_output_hash))continue;
    out.push({id:'rejected:'+row.tx_hash,ventureId:m.ventureId,kind:'REJECTED_ATTEMPT',label:'CHAIN_VERIFIED',status:'VERIFIED',chainId:1874,txHash:row.tx_hash,blockNumber:row.block_number,blockHash:row.block_hash,confirmedAt:row.confirmed_at,source:'WHITECHAIN_RPC',revertReason:'GS020',reasonSource:'MINED_TRACE'});
   }catch{/* No trace/no canonical receipt means no published GS020 evidence. */}
  }
  return out;
 }
}
