export interface ContractArtifact {address:`0x${string}`;deploymentTxHash:`0x${string}`;deploymentBlock:number;runtimeCodeHash:`0x${string}`;abiPath:string;abiSha256:string;verifiedSourceUrl?:string}
export interface TokenDomain {name:'Tether USD';version:'1';chainId:1874;verifyingContract:`0x${string}`}
export type TokenArtifact=ContractArtifact&{decimals:6;eip712Domain:TokenDomain;domainSeparator:`0x${string}`;implementation:ContractArtifact};
export interface DeploymentManifestV1 {
 schemaVersion:1;network:'whitechain-sepolia';chainId:1874;deploymentBlock:number;sourceCommit:string;explorerBaseUrl:string;
 ventureId:`0x${string}`;ensName:string;owners:[`0x${string}`,`0x${string}`];threshold:2;setupInitializerHash:`0x${string}`;approvedAt:string;
 contracts:{safe:ContractArtifact;guard:ContractArtifact;registry:ContractArtifact;singleton:ContractArtifact;factory:ContractArtifact;setup:ContractArtifact;token:TokenArtifact};
}
export type InfrastructureManifestV1=Pick<DeploymentManifestV1,'schemaVersion'|'chainId'|'sourceCommit'|'approvedAt'|'explorerBaseUrl'>&{kind:'infrastructure';contracts:Pick<DeploymentManifestV1['contracts'],'registry'|'setup'|'singleton'|'factory'|'token'>};
export function validateManifest(manifest:unknown,options?:{infrastructure?:boolean}):DeploymentManifestV1|InfrastructureManifestV1;
export function adaptDeploymentManifest(manifest:DeploymentManifestV1):{manifest:{ventureId:`0x${string}`;safe:`0x${string}`;guard:`0x${string}`;registry:`0x${string}`;singleton:`0x${string}`;factory:`0x${string}`;setup:`0x${string}`;safeCodeHash:`0x${string}`;guardCodeHash:`0x${string}`;registryCodeHash:`0x${string}`;singletonCodeHash:`0x${string}`;factoryCodeHash:`0x${string}`;setupCodeHash:`0x${string}`;deploymentBlock:number;approved:DeploymentManifestV1};token:{address:`0x${string}`;codeHash:`0x${string}`;implementation:`0x${string}`;implementationCodeHash:`0x${string}`;decimals:6;domain:TokenDomain;domainSeparator:`0x${string}`}};
export function loadManifest(path:string,options?:{root?:string;infrastructure?:boolean}):Promise<DeploymentManifestV1|InfrastructureManifestV1>;
export const anchors:Readonly<{singleton:string;factory:string;token:string}>;
