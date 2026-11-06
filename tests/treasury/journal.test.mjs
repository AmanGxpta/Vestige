import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileJournal } from '../../src/modules/relayer/journal.mjs';
import { fixture } from './fixtures.mjs';
test('reservation persists across process-like restarts without storing signatures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestige-journal-'));const path=join(dir,'state.json');
 try {
  const f=fixture({journal:new FileJournal(path)});const r=await f.fund();await f.relay.fund(r);
  const f2=fixture({journal:new FileJournal(path)});await assert.rejects(f2.relay.fund(r),/DUPLICATE_OR_PENDING/);
  const saved=await readFile(path,'utf8');assert.ok(!saved.includes(r.signature));assert.equal(f2.sends.length,0);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('retained crash lock and corrupt state fail closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestige-journal-'));const path=join(dir,'state.json');
 try {
  await writeFile(path+'.lock','');await assert.rejects(new FileJournal(path).run(()=>{}),/RECOVERY_REQUIRED/);
  await rm(path+'.lock');await writeFile(path,'corrupt');await assert.rejects(new FileJournal(path).run(()=>{}));
 } finally {await rm(dir,{recursive:true,force:true});}
});
import {recoverDeadJournalLock} from '../../src/modules/relayer/journal.mjs';
import {createHash} from 'node:crypto';
test('crash-lock recovery requires dead PID, exact review and retains nonce/replay reservations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestige-recover-')),path=join(dir,'journal.json');
 try{
  const state=JSON.stringify({requests:{test:{status:'UNKNOWN',senderNonce:'2'}},counts:{},spent:'100'});await writeFile(path,state);
  const review={approved:true,reference:'LOCAL_TEST',expectedJournalSha256:createHash('sha256').update(state).digest('hex')};
  await writeFile(path+'.lock',JSON.stringify({pid:process.pid}));await assert.rejects(recoverDeadJournalLock(path,review),/MAY_BE_ALIVE/);
  await writeFile(path+'.lock',JSON.stringify({pid:2147483647}));await assert.rejects(recoverDeadJournalLock(path,{...review,expectedJournalSha256:'invalid'}),/REVIEW_MISMATCH/);
  assert.equal((await recoverDeadJournalLock(path,review)).inflight,1);
  await new FileJournal(path).run(async session=>assert.equal(session.state.requests.test.status,'UNKNOWN'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
