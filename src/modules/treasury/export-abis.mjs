import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseAbi} from 'viem';
export async function exportAbis(){
 await mkdir('contracts/abi',{recursive:true});const index={compiler:'0.8.24',artifacts:{}};
 const targets={SeatRegistry:'contracts/SeatRegistry.sol:SeatRegistry',VestigeGuard:'contracts/VestigeGuard.sol:VestigeGuard',SafeSetup:'contracts/SafeSetup.sol:SafeSetup',SafeL2:'contracts/vendor/safe/contracts/SafeL2.sol:SafeL2',SafeProxyFactory:'contracts/vendor/safe/contracts/proxies/SafeProxyFactory.sol:SafeProxyFactory'};
 const abis={};
 for(const [name,target]of Object.entries(targets))abis[name]=JSON.parse(execFileSync('forge',['inspect',target,'abi','--json'],{encoding:'utf8'}));
 abis.TestUSDT=parseAbi(['function transfer(address to,uint256 value) returns (bool)','function balanceOf(address wallet) view returns (uint256)','function decimals() view returns (uint8)','function DOMAIN_SEPARATOR() view returns (bytes32)','function authorizationState(address authorizer,bytes32 nonce) view returns (bool)','function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)','function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)','event Transfer(address indexed from,address indexed to,uint256 value)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
 for(const[name,abi]of Object.entries(abis)){const path=`contracts/abi/${name}.json`;const data=JSON.stringify(abi,null,2)+'\n';await writeFile(path,data);index.artifacts[name]={abiPath:path,abiSha256:createHash('sha256').update(data).digest('hex')};}
 await writeFile('contracts/abi/index.json',JSON.stringify(index,null,2)+'\n');
}
