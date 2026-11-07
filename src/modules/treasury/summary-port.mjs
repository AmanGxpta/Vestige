import {parseAbi} from 'viem';
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)']);
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
/** CR-ID-05 implementation. C1/H must wire the approved dependency and settle cached observation provenance. */
export class TreasurySummaryPort {
 constructor({service,client,now=()=>Date.now()}){Object.assign(this,{service,client,now});}
 async summary(ventureId){
  const m=this.service.manifests.find(m=>m.ventureId===ventureId);
  const unknown=()=>({treasuryActive:null,funded:null,observedAt:new Date(this.now()).toISOString(),source:'vestige-treasury:UNKNOWN',verificationStatus:m?'UNVERIFIED':'UNKNOWN'});
  if(!m)return unknown();
  let c;try{
   c=await this.service.context(ventureId);
   if(await this.client.getChainId()!==1874||c.state.blockNumber===undefined||!eq((await this.client.getBlock({blockNumber:c.state.blockNumber})).hash,c.state.blockHash))return unknown();
  }catch{return unknown();}
  let funded=null;
  try{
   const [amount,decimals]=await Promise.all([this.client.readContract({address:m.contracts.token.address,abi,functionName:'balanceOf',args:[m.contracts.safe.address],blockNumber:c.state.blockNumber}),this.client.readContract({address:m.contracts.token.address,abi,functionName:'decimals',blockNumber:c.state.blockNumber})]);
   if((decimals===6||decimals===6n)&&typeof amount==='bigint'&&amount>=0n)funded=amount>0n;
  }catch{/* Successful Safe checks do not turn failed balance reads into zero. */}
  try{if(!eq((await this.client.getBlock({blockNumber:c.state.blockNumber})).hash,c.state.blockHash))return unknown();}catch{return unknown();}
  return {treasuryActive:true,funded,observedAt:new Date(this.now()).toISOString(),source:'WHITECHAIN_RPC+'+this.service.store.source(ventureId),verificationStatus:'ACTIVE'};
 }
}
