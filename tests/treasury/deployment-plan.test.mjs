import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {deploymentPlan,operators} from '../../src/modules/treasury/deployment-plan.mjs';
import {sqlFixture,ventureId,addr} from './service-fixtures.mjs';
test('unsigned infrastructure plan uses the fresh Vestige public roles without inventing funding or receipts',()=>{
 const p=deploymentPlan('infrastructure');assert.equal(p.sender,operators.deployer);assert.equal(p.deployments[0].constructorArgs[0],operators.attester);
 assert.equal(p.broadcastAuthorized,false);assert.equal(p.fundingStatus,'UNCONFIRMED');assert.equal(p.status,'NOT_SUBMITTED');assert.equal(p.txHash,undefined);assert.equal(p.deploymentBlock,undefined);
});
test('staging seat preparation cannot authorize a real-human or live treasury claim',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestige-plan-'));const path=join(dir,'app.sqlite');const f=sqlFixture(path);
 try{
  f.db.run("UPDATE identity_world_nullifiers SET environment='staging'");
  const env={VESTIGE_DB_PATH:path,VENTURE_ID:ventureId,TREASURY_SALT:'0x'+'55'.repeat(32),SEAT_REGISTRY_ADDRESS:addr(400),SAFE_SETUP_ADDRESS:addr(500)};
  const p=deploymentPlan('treasury',env);assert.equal(p.source,'TESTED_IN_SIMULATOR');assert.equal(p.realHumanClaimAllowed,false);assert.equal(p.broadcastAuthorized,false);
  f.db.run("UPDATE identity_seats SET onchain_status='PENDING'");assert.throws(()=>deploymentPlan('treasury',env),/TWO_CONFIRMED_SEATS/);
 }finally{f.close();await rm(dir,{recursive:true,force:true});}
});
