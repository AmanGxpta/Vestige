import {decodeFunctionData,keccak256,parseAbi,parseEventLogs,zeroAddress} from 'viem';
const factoryAbi=parseAbi(['function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)','event ProxyCreation(address indexed proxy,address singleton)']);
const safeAbi=parseAbi(['function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)','event ChangedGuard(address indexed guard)']);
const helperAbi=parseAbi(['function install(address registry,bytes32 ventureId)']);
const eq=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const check=ok=>{if(!ok)throw new Error('MANIFEST_PROVENANCE_MISMATCH');};
export async function verifyManifestProvenance(client,m){
 check(await client.getChainId()===1874);const head=await client.getBlockNumber({cacheTime:0});
 for(const a of [...Object.values(m.contracts),m.contracts.token.implementation]){
  const r=await client.getTransactionReceipt({hash:a.deploymentTxHash});
  check(r.status==='success'&&r.blockNumber===BigInt(a.deploymentBlock)&&head>=r.blockNumber+1n);
  const block=await client.getBlock({blockNumber:r.blockNumber});check(eq(block.hash,r.blockHash));
  const code=await client.getCode({address:a.address,blockNumber:r.blockNumber});check(code&&code!=='0x'&&eq(keccak256(code),a.runtimeCodeHash));
 }
 if(m.kind==='infrastructure')return {infrastructure:true};
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
 return {blockHash:receipt.blockHash,deployer:tx.from};
}
