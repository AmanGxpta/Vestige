import {createHash,randomUUID} from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

// Single-host durable journal. A retained lock after a crash requires operator reconciliation.
// It is intentionally not a distributed database/session implementation.
export class FileJournal {
  constructor(path) { this.path = path; }
  async run(fn) {
    await mkdir(dirname(this.path), {recursive:true,mode:0o700});
    let lock;
    try { lock = await open(`${this.path}.lock`, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('JOURNAL_BUSY_OR_RECOVERY_REQUIRED'); throw error; }
    try {
      await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:Date.now(),token:randomUUID()}));await lock.sync();
      let state;
      try { state = JSON.parse(await readFile(this.path,'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; state = {requests:{},counts:{},spent:'0'}; }
      if (!state.requests || !state.counts || !/^\d+$/.test(state.spent)) throw new Error('INVALID_JOURNAL');
      const commit = async () => {
        const temp = `${this.path}.tmp`;
        const handle = await open(temp,'w',0o600);
        try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); }
        finally { await handle.close(); }
        await rename(temp,this.path);
        const directory = await open(dirname(this.path),'r');
        try { await directory.sync(); } finally { await directory.close(); }
      };
      return await fn({state,commit});
    } finally { await lock.close(); await unlink(`${this.path}.lock`); }
  }
}

/** Explicit operator recovery, only for a provably dead owner and an exact reviewed journal snapshot. */
export async function recoverDeadJournalLock(path,{approved,reference,expectedJournalSha256}) {
  if(approved!==true||!reference)throw new Error('OPERATOR_REVIEW_REQUIRED');
  const meta=JSON.parse(await readFile(`${path}.lock`,'utf8'));
  if(!Number.isSafeInteger(meta.pid)||meta.pid<=0)throw new Error('LEGACY_LOCK_MANUAL_AUDIT_REQUIRED');
  let dead=false;try{process.kill(meta.pid,0);}catch(e){if(e.code==='ESRCH')dead=true;}
  if(!dead)throw new Error('JOURNAL_OWNER_MAY_BE_ALIVE');
  const bytes=await readFile(path);
  if(createHash('sha256').update(bytes).digest('hex')!==expectedJournalSha256)throw new Error('JOURNAL_REVIEW_MISMATCH');
  const state=JSON.parse(bytes);
  if(Object.values(state.requests||{}).some(r=>['RESERVED','UNKNOWN','SUBMITTED'].includes(r.status)&&r.senderNonce===undefined))throw new Error('LEGACY_NONCE_MANUAL_AUDIT_REQUIRED');
  const destination=`${path}.recovered-${Date.now()}.lock`;
  await rename(`${path}.lock`,destination);
  return {recoveredLock:destination,reference,inflight:Object.values(state.requests||{}).filter(r=>['RESERVED','UNKNOWN','SUBMITTED'].includes(r.status)).length};
}
