// Public compiled artifacts only. No signer, keystore, environment dump or network call.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {operators} from '../../src/modules/treasury/deployment-plan.mjs';
const require=createRequire(new URL('../../src/modules/treasury/package.json',import.meta.url));
const {encodeAbiParameters,keccak256,concat}=require('viem');
const rows=[];
for(const [name,arg]of [['SeatRegistry',operators.attester],['SafeSetup','0x29fcB43b46531BcA003ddC8FCB67FFE91900C762']]){
 const a=JSON.parse(await readFile(new URL(`../../contracts/.artifacts/${name}.sol/${name}.json`,import.meta.url),'utf8'));
 const args=encodeAbiParameters([{type:'address'}],[arg]);
 rows.push({contract:`contracts/${name}.sol:${name}`,sourceSha256:createHash('sha256').update(await readFile(new URL(`../../contracts/${name}.sol`,import.meta.url))).digest('hex'),constructorArgs:[arg],encodedConstructorArgs:args,creationBytecodeKeccak256:keccak256(a.bytecode.object),initCodeKeccak256:keccak256(concat([a.bytecode.object,args])),compiledRuntimeTemplateKeccak256:keccak256(a.deployedBytecode.object),immutableReferences:a.deployedBytecode.immutableReferences||{}});
}
console.log(JSON.stringify({kind:'UNAPPROVED_BUILD_REVIEW',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),chainId:1874,compiler:'v0.8.24+commit.e11b9ed9',optimizerRuns:200,evmVersion:'paris',broadcastAuthorized:false,deployments:rows,warning:'Runtime template hashes are not live code hashes: constructor immutables must be read from actual deployed code.'},null,2));
