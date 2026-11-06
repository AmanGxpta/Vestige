import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {loadManifest,adaptDeploymentManifest} from './manifest.mjs';
import {verifyManifestProvenance} from './provenance.mjs';
import {RestrictedRelayer} from '../relayer/relayer.mjs';
import {RpcIO} from '../relayer/rpc-io.mjs';
import {operators} from './deployment-plan.mjs';
import {parseAbi,createPublicClient,http} from 'viem';
/** After real, separately approved receipts exist. Local file publication only, never a signer. */
export async function publishReviewedManifest({candidatePath,review,client,root=process.cwd()}){
 if(review?.approved!==true||review.chainId!==1874||!review.reference)throw new Error('MANIFEST_REVIEW_REQUIRED');
 const bytes=await readFile(candidatePath),sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==review.manifestSha256)throw new Error('MANIFEST_REVIEW_DIGEST_MISMATCH');
 const preview=JSON.parse(bytes),infrastructure=preview.kind==='infrastructure';
 const m=await loadManifest(candidatePath,{root,infrastructure});
 if(m.sourceCommit!==review.sourceCommit||m.approvedAt!==review.approvedAt)throw new Error('MANIFEST_APPROVAL_MISMATCH');
 await verifyManifestProvenance(client,m);
 if(infrastructure){
  const abi=parseAbi(['function attester() view returns(address)','function singleton() view returns(address)']);
  const attester=await client.readContract({address:m.contracts.registry.address,abi,functionName:'attester'});
  const singleton=await client.readContract({address:m.contracts.setup.address,abi,functionName:'singleton'});
  if(attester.toLowerCase()!==operators.attester.toLowerCase()||singleton.toLowerCase()!==m.contracts.singleton.address.toLowerCase())throw new Error('INFRASTRUCTURE_BINDING_MISMATCH');
 }else{
  const {manifest,token}=adaptDeploymentManifest(m);
  await new RestrictedRelayer({manifests:[manifest],token,io:new RpcIO({client,sender:operators.relayer})}).context(m.ventureId);
 }
 const dir=resolve(root,'contracts/manifests/published');await mkdir(dir,{recursive:true});
 const name=(infrastructure?'infrastructure':m.ensName)+'-'+m.sourceCommit.slice(0,12)+'.json',path=join(dir,name);
 try{await writeFile(path,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(createHash('sha256').update(await readFile(path)).digest('hex')!==sha256)throw new Error('PUBLISHED_MANIFEST_EXISTS_WITH_DIFFERENT_BYTES');}
 return {path,sha256,reference:review.reference,chainId:1874,kind:infrastructure?'infrastructure':'treasury',broadcasts:0};
}

export async function publishManifestFiles(candidatePath,reviewPath,rpc){
 const review=JSON.parse(await readFile(reviewPath,'utf8'));
 return publishReviewedManifest({candidatePath,review,client:createPublicClient({transport:http(rpc)})});
}
