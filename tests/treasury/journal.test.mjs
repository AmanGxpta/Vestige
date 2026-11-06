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
