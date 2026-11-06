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
