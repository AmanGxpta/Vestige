import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const address=/^0x[0-9a-fA-F]{40}$/;
const hash=/^0x[0-9a-fA-F]{64}$/;
export const anchors=Object.freeze({singleton:'0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',factory:'0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',token:'0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7'});
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const need=(value)=>{if(!value)throw new Error('INVALID_DEPLOYMENT_MANIFEST');};
const only=(obj,keys)=>need(obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>keys.includes(k)));
function artifact(a,token=false){
 only(a,['address','deploymentTxHash','deploymentBlock','runtimeCodeHash','abiPath','abiSha256','verifiedSourceUrl',...(token?['decimals','eip712Domain','domainSeparator','implementation']:[])]);
 need(a&&address.test(a.address)&&!/^0x0{40}$/.test(a.address));
 need(hash.test(a.deploymentTxHash)&&!/^0x0{64}$/.test(a.deploymentTxHash));
 need(Number.isSafeInteger(a.deploymentBlock)&&a.deploymentBlock>=0&&hash.test(a.runtimeCodeHash));
 need(typeof a.abiPath==='string'&&/^contracts\/abi\/[A-Za-z0-9_.-]+\.json$/.test(a.abiPath));
 need(/^[0-9a-f]{64}$/.test(a.abiSha256));
 if(a.verifiedSourceUrl!==undefined)need(/^https:\/\//.test(a.verifiedSourceUrl));
}
export function validateManifest(m,{infrastructure=false}={}){
 only(m,['schemaVersion','chainId','sourceCommit','approvedAt','explorerBaseUrl','contracts',...(infrastructure?['kind']:['network','deploymentBlock','ventureId','ensName','owners','threshold','setupInitializerHash'])]);
 need(m&&m.schemaVersion===1&&m.chainId===1874&&/^[0-9a-f]{40}$/.test(m.sourceCommit));
 need(typeof m.approvedAt==='string'&&Number.isFinite(Date.parse(m.approvedAt))&&/Z$/.test(m.approvedAt));
 need(m.explorerBaseUrl==='https://explorer.testnet.whitechain.io'||m.explorerBaseUrl==='https://explorer.testnet.whitechain.io/');
 need(m.contracts);
 const names=infrastructure?['registry','singleton','factory','setup','token']:['safe','guard','registry','singleton','factory','setup','token'];
 only(m.contracts,names);
 for(const name of names)artifact(m.contracts[name],name==='token');
 for(const name of ['singleton','factory','token'])need(eq(m.contracts[name].address,anchors[name]));
 const token=m.contracts.token;artifact(token.implementation);
 const d=token.eip712Domain;only(d,['name','version','chainId','verifyingContract']);
 need(token.decimals===6&&hash.test(token.domainSeparator)&&d?.name==='Tether USD'&&d.version==='1'&&d.chainId===1874&&eq(d.verifyingContract,token.address));
 if(infrastructure){need(m.kind==='infrastructure');need(!m.contracts.safe&&!m.contracts.guard);return m;}
 need(m.network==='whitechain-sepolia'&&/^0x[0-9a-f]{64}$/.test(m.ventureId)&&!/^0x0{64}$/.test(m.ventureId));
 need(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vestige\.eth$/.test(m.ensName));
 need(Number.isSafeInteger(m.deploymentBlock)&&m.deploymentBlock===m.contracts.safe.deploymentBlock);
 need(m.threshold===2&&m.owners?.length===2&&m.owners.every(o=>address.test(o)&&!/^0x0{40}$/.test(o))&&!eq(...m.owners));
 need(hash.test(m.setupInitializerHash));return m;
}
/** Pure locked-schema → existing service adapter. No address/provenance defaults. */
export function adaptDeploymentManifest(input){
 const m=validateManifest(structuredClone(input));const c=m.contracts;
 return {manifest:{ventureId:m.ventureId,safe:c.safe.address,guard:c.guard.address,registry:c.registry.address,
  singleton:c.singleton.address,factory:c.factory.address,setup:c.setup.address,
  safeCodeHash:c.safe.runtimeCodeHash,guardCodeHash:c.guard.runtimeCodeHash,registryCodeHash:c.registry.runtimeCodeHash,
  singletonCodeHash:c.singleton.runtimeCodeHash,factoryCodeHash:c.factory.runtimeCodeHash,setupCodeHash:c.setup.runtimeCodeHash,
  deploymentBlock:m.deploymentBlock,approved:m},
 token:{address:c.token.address,codeHash:c.token.runtimeCodeHash,implementation:c.token.implementation.address,
  implementationCodeHash:c.token.implementation.runtimeCodeHash,decimals:6,domain:c.token.eip712Domain,domainSeparator:c.token.domainSeparator}};
}
export async function loadManifest(path,{root=process.cwd(),infrastructure=false}={}){
 const m=validateManifest(JSON.parse(await readFile(path,'utf8')),{infrastructure});
 const base=await realpath(root);
 for(const a of [...Object.values(m.contracts),m.contracts.token.implementation]){
  const file=await realpath(resolve(base,a.abiPath));need(file.startsWith(base+sep));
  const bytes=await readFile(file);need(createHash('sha256').update(bytes).digest('hex')===a.abiSha256);
  need(Array.isArray(JSON.parse(bytes)));
 }
 return m;
}
