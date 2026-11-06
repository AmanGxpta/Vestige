import {createHash} from 'node:crypto';
import {openTreasuryStore} from '../../src/modules/treasury/store.mjs';
import {a,b,addr,ventureId} from './fixtures.mjs';
export {a,b,addr,ventureId};
export const txHash=`0x${'55'.repeat(32)}`,blockHash=`0x${'66'.repeat(32)}`;
export function sqlFixture(){
 const store=openTreasuryStore(':memory:');const db=store.db;
 db.raw.exec(`CREATE TABLE identity_ventures(venture_id TEXT PRIMARY KEY,ens_name TEXT);
 CREATE TABLE identity_sessions(token_hash TEXT PRIMARY KEY,wallet TEXT,expires_at INTEGER);
 CREATE TABLE identity_seats(venture_id TEXT,wallet TEXT,world_status TEXT,onchain_status TEXT);
 CREATE TABLE identity_world_nullifiers(venture_id TEXT,wallet TEXT,environment TEXT,protocol_version TEXT);`);
 db.run('INSERT INTO identity_ventures VALUES(?,?)',ventureId,'test.ves'+'tige.eth');
 for(const owner of [a,b]){
  db.run('INSERT INTO identity_seats VALUES(?,?,?,?)',ventureId,owner.address.toLowerCase(),'VERIFIED','VERIFIED');
  db.run('INSERT INTO identity_world_nullifiers VALUES(?,?,?,?)',ventureId,owner.address.toLowerCase(),'production','4.0');
 }
 const token='local-test-bearer-not-a-real-session';
 db.run('INSERT INTO identity_sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),a.address.toLowerCase(),Date.now()+60000);
 return {store,db,token,close:()=>db.raw.close()};
}
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../src/modules/treasury/package.json',import.meta.url));
export const viem=require('viem');
export function manifestFixture(){
 const artifact=(n)=>({address:addr(n),deploymentTxHash:txHash,deploymentBlock:1,runtimeCodeHash:blockHash,abiPath:'contracts/abi/SeatRegistry.json',abiSha256:'a'.repeat(64)});
 const contracts=Object.fromEntries(['safe','guard','registry','singleton','factory','setup','token'].map((n,i)=>[n,artifact(100+i)]));
 contracts.singleton.address='0x29fcB43b46531BcA003ddC8FCB67FFE91900C762';contracts.factory.address='0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';contracts.token.address='0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
 Object.assign(contracts.token,{decimals:6,domainSeparator:blockHash,implementation:artifact(999),eip712Domain:{name:'Tether USD',version:'1',chainId:1874,verifyingContract:contracts.token.address}});
 return {schemaVersion:1,network:'whitechain-sepolia',chainId:1874,deploymentBlock:1,sourceCommit:'a'.repeat(40),explorerBaseUrl:'https://explorer.testnet.whitechain.io',ventureId,ensName:'test.vestige.eth',owners:[a.address,b.address],threshold:2,setupInitializerHash:blockHash,approvedAt:'2026-11-07T00:00:00.000Z',contracts};
}
