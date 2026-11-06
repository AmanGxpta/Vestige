import {createPublicClient,http} from 'viem';
import {loadManifest,adaptDeploymentManifest} from './manifest.mjs';
import {verifyManifestProvenance} from './provenance.mjs';
import {RestrictedRelayer} from '../relayer/relayer.mjs';
import {RpcIO} from '../relayer/rpc-io.mjs';
import {operators} from './deployment-plan.mjs';
export async function readback(path,rpc){
 const client=createPublicClient({transport:http(rpc)}),m=await loadManifest(path);
 const {manifest,token}=adaptDeploymentManifest(m);await verifyManifestProvenance(client,m);
 const io=new RpcIO({client,sender:operators.relayer});const {state}=await new RestrictedRelayer({manifests:[manifest],token,io}).context(m.ventureId);
 return {claim:'READ_ONLY_CHAIN_READBACK',ventureId:m.ventureId,deploymentBlock:m.deploymentBlock,...state};
}
export async function inspectFees(hashes,rpc){
 if(!hashes.length||hashes.some(h=>!/^0x[0-9a-fA-F]{64}$/.test(h)))throw new Error('RECEIPT_HASHES_REQUIRED');
 const client=createPublicClient({transport:http(rpc)});if(await client.getChainId()!==1874)throw new Error('WRONG_CHAIN');
 const head=await client.getBlockNumber({cacheTime:0});const out=[];
 for(const hash of hashes){
  const receipt=await client.getTransactionReceipt({hash});const raw=await client.request({method:'eth_getTransactionReceipt',params:[hash]});
  if(raw.l1Fee===undefined||receipt.blockNumber+1n>head||(await client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw new Error('FEE_RECEIPT_UNVERIFIED');
  out.push({txHash:hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,evmFeeWei:String(receipt.gasUsed*receipt.effectiveGasPrice),l1FeeWei:String(BigInt(raw.l1Fee))});
 }
 return {claim:'OBSERVED_PUBLIC_RECEIPTS_NOT_A_FEE_POLICY',chainId:1874,reviewRequired:true,measurements:out};
}
