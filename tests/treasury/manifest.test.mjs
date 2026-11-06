import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptDeploymentManifest} from '../../src/modules/treasury/manifest.mjs';
test('missing approved manifest never fabricates a registered treasury',()=>{
 assert.throws(()=>adaptDeploymentManifest({schemaVersion:1,chainId:1874}));
});
import {manifestFixture} from './service-fixtures.mjs';
import {validateManifest,loadManifest} from '../../src/modules/treasury/manifest.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('approved nested schema maps losslessly to flat relayer fingerprints',()=>{
 const m=manifestFixture();const {manifest,token}=adaptDeploymentManifest(m);
 assert.equal(manifest.setup,m.contracts.setup.address);assert.equal(manifest.deploymentBlock,m.deploymentBlock);
 assert.equal(token.implementationCodeHash,m.contracts.token.implementation.runtimeCodeHash);
 for(const mutate of [m=>delete m.contracts.setup,m=>delete m.contracts.token.implementation,m=>m.threshold=1,m=>m.contracts.token.eip712Domain.chainId=1,m=>m.contracts.registry.deploymentTxHash='0x'+'0'.repeat(64)]){
  const bad=manifestFixture();mutate(bad);assert.throws(()=>adaptDeploymentManifest(bad));
 }
});
test('infrastructure schema cannot masquerade as a treasury',()=>{
 const m=manifestFixture();delete m.contracts.safe;delete m.contracts.guard;m.kind='infrastructure';
 assert.ok(validateManifest(m,{infrastructure:true}));assert.throws(()=>adaptDeploymentManifest(m));
});
test('published ABI index matches exact file bytes and Solidity function/event exports',async()=>{
 const index=JSON.parse(await readFile('contracts/abi/index.json','utf8'));
 for(const a of Object.values(index.artifacts))assert.equal(createHash('sha256').update(await readFile(a.abiPath)).digest('hex'),a.abiSha256);
 const registry=JSON.parse(await readFile(index.artifacts.SeatRegistry.abiPath,'utf8'));
 assert.ok(registry.some(a=>a.type==='event'&&a.name==='SeatAttested'));assert.ok(registry.some(a=>a.name==='isSeat'));
});
