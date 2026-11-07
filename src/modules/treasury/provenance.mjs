import {EXPLORER_ATTESTED_ANCHORS} from './manifest.mjs';
import {decodeFunctionData,keccak256,parseAbi,parseEventLogs,zeroAddress} from 'viem';
const factoryAbi=parseAbi(['function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)','event ProxyCreation(address indexed proxy,address singleton)']);
const safeAbi=parseAbi(['function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)','event ChangedGuard(address indexed guard)']);
const helperAbi=parseAbi(['function install(address registry,bytes32 ventureId)']);
const eq=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const check=ok=>{if(!ok)throw new Error('MANIFEST_PROVENANCE_MISMATCH');};
function created(trace,address){
 if(!trace||trace.error)return false;
 if(['CREATE','CREATE2'].includes(trace.type?.toUpperCase())&&eq(trace.to,address))return true;
 return Array.isArray(trace.calls)&&trace.calls.some(call=>created(call,address));
}
export async function verifyManifestProvenance(client,m,{codeHash=keccak256}={}){
 check(await client.getChainId()===1874);const head=await client.getBlockNumber({cacheTime:0});
 const traces=new Map(),explorerAttested=[];
 const entries=[...Object.entries(m.contracts),['tokenImplementation',m.contracts.token.implementation]];
 for(const [key,a] of entries){
  const r=await client.getTransactionReceipt({hash:a.deploymentTxHash});
  check(r.status==='success'&&r.blockNumber===BigInt(a.deploymentBlock)&&head>=r.blockNumber+1n);
  const block=await client.getBlock({blockNumber:r.blockNumber});check(eq(block.hash,r.blockHash));
  if(a.provenance==='EXPLORER_ATTESTED'){
   // H decision A: only pinned pre-existing anchors (validateManifest enforces key/address/hash).
   // Creation tx/block are Blockscout-attested; live code at head must equal the pinned anchor.
   const anchor=EXPLORER_ATTESTED_ANCHORS[key];check(anchor&&eq(anchor.address,a.address));
   const code=await client.getCode({address:a.address,blockNumber:head});
   check(code&&code!=='0x'&&eq(codeHash(code),anchor.runtimeCodeHash)&&eq(a.runtimeCodeHash,anchor.runtimeCodeHash));
   explorerAttested.push(key);continue;
  }
  const code=await client.getCode({address:a.address,blockNumber:r.blockNumber});check(code&&code!=='0x'&&eq(codeHash(code),a.runtimeCodeHash));
  // Code at this block does not bind an arbitrary successful tx to its creation.
  // Direct deployments have contractAddress; factory children need a mined trace.
  if(!eq(r.contractAddress,a.address)){
   if(!traces.has(a.deploymentTxHash)){
    let trace;try{trace=await client.request({method:'debug_traceTransaction',params:[a.deploymentTxHash,{tracer:'callTracer'}]});}catch{/* Fail closed without creation evidence. */}
    traces.set(a.deploymentTxHash,trace);
   }
   if(!created(traces.get(a.deploymentTxHash),a.address))throw new Error('MANIFEST_CREATION_UNPROVEN');
  }
 }
 const label=explorerAttested.length?{explorerAttested}:{};
 if(m.kind==='infrastructure')return {infrastructure:true,...label};
 const c=m.contracts,receipt=await client.getTransactionReceipt({hash:c.safe.deploymentTxHash});
 const tx=await client.getTransaction({hash:c.safe.deploymentTxHash});check(eq(tx.to,c.factory.address));
 const f=decodeFunctionData({abi:factoryAbi,data:tx.input});check(f.functionName==='createProxyWithNonce'&&eq(f.args[0],c.singleton.address));
 check(eq(keccak256(f.args[1]),m.setupInitializerHash));
 const setup=decodeFunctionData({abi:safeAbi,data:f.args[1]});check(setup.functionName==='setup');
 const [owners,threshold,helper,data,handler,paymentToken,payment,receiver]=setup.args;
 check(owners.length===2&&owners.every(o=>m.owners.some(x=>eq(x,o)))&&threshold===2n&&eq(helper,c.setup.address)&&eq(handler,zeroAddress)&&eq(paymentToken,zeroAddress)&&payment===0n&&eq(receiver,zeroAddress));
 const install=decodeFunctionData({abi:helperAbi,data});check(install.functionName==='install'&&eq(install.args[0],c.registry.address)&&eq(install.args[1],m.ventureId));
 check(parseEventLogs({abi:factoryAbi,logs:receipt.logs}).some(l=>eq(l.address,c.factory.address)&&eq(l.args.proxy,c.safe.address)&&eq(l.args.singleton,c.singleton.address)));
 check(parseEventLogs({abi:safeAbi,logs:receipt.logs}).some(l=>eq(l.address,c.safe.address)&&eq(l.args.guard,c.guard.address)));
 return {blockHash:receipt.blockHash,deployer:tx.from,...label};
}
