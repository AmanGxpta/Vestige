import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const address=/^0x[0-9a-fA-F]{40}$/;
const hash=/^0x[0-9a-fA-F]{64}$/;
export const anchors=Object.freeze({singleton:'0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',factory:'0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',token:'0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7'});
/** H decision A (2026-11-07): the ONLY artifacts that may carry provenance:"EXPLORER_ATTESTED".
 * Addresses + live runtime code hashes are pinned (singleton/factory equal DeployInfrastructure.s.sol). */
export const EXPLORER_ATTESTED_ANCHORS=Object.freeze({
 singleton:{address:'0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',runtimeCodeHash:'0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff'},
 factory:{address:'0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',runtimeCodeHash:'0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317'},
 token:{address:'0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',runtimeCodeHash:'0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e'},
 tokenImplementation:{address:'0x26425662D126412128967ECf0a02EC48573026F7',runtimeCodeHash:'0xb5c69874a061f6c8750294eefc2de2f45a7c229e961b03fc901f3612010822d6'}});
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const need=(value)=>{if(!value)throw new Error('INVALID_DEPLOYMENT_MANIFEST');};
const only=(obj,keys)=>need(obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>keys.includes(k)));
function artifact(a,token=false,key){
 only(a,['address','deploymentTxHash','deploymentBlock','runtimeCodeHash','abiPath','abiSha256','verifiedSourceUrl','provenance',...(token?['decimals','eip712Domain','domainSeparator','implementation']:[])]);
 need(a&&address.test(a.address)&&!/^0x0{40}$/.test(a.address));
 need(hash.test(a.deploymentTxHash)&&!/^0x0{64}$/.test(a.deploymentTxHash));
 need(Number.isSafeInteger(a.deploymentBlock)&&a.deploymentBlock>=0&&hash.test(a.runtimeCodeHash));
 need(typeof a.abiPath==='string'&&/^contracts\/abi\/[A-Za-z0-9_.-]+\.json$/.test(a.abiPath));
 need(/^[0-9a-f]{64}$/.test(a.abiSha256));
 if(a.verifiedSourceUrl!==undefined)need(/^https:\/\//.test(a.verifiedSourceUrl));
 if(a.provenance!==undefined){const anchor=EXPLORER_ATTESTED_ANCHORS[key];
  need(a.provenance==='EXPLORER_ATTESTED'&&anchor&&eq(a.address,anchor.address)&&a.runtimeCodeHash.toLowerCase()===anchor.runtimeCodeHash);}
}
export function validateManifest(m,{infrastructure=false}={}){
 only(m,['schemaVersion','chainId','sourceCommit','approvedAt','explorerBaseUrl','contracts',...(infrastructure?['kind']:['network','deploymentBlock','ventureId','ensName','owners','threshold','setupInitializerHash'])]);
 need(m&&m.schemaVersion===1&&m.chainId===1874&&/^[0-9a-f]{40}$/.test(m.sourceCommit));
 need(typeof m.approvedAt==='string'&&Number.isFinite(Date.parse(m.approvedAt))&&/Z$/.test(m.approvedAt));
 need(m.explorerBaseUrl==='https://explorer.testnet.whitechain.io'||m.explorerBaseUrl==='https://explorer.testnet.whitechain.io/');
 need(m.contracts);
 const names=infrastructure?['registry','singleton','factory','setup','token']:['safe','guard','registry','singleton','factory','setup','token'];
 only(m.contracts,names);
 for(const name of names)artifact(m.contracts[name],name==='token',name);
 for(const name of ['singleton','factory','token'])need(eq(m.contracts[name].address,anchors[name]));
 const token=m.contracts.token;artifact(token.implementation,false,'tokenImplementation');
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
