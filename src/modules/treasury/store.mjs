import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
export class TreasuryError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const fail=(code,status=400)=>{throw new TreasuryError(code,status);};
export class TreasuryStore {
 constructor(db){this.db=db;}
 migrate(){if(!this.db.raw)throw new Error('MIGRATION_CONNECTION_REQUIRED');for(const name of ['020_treasury.sql','020_treasury_readback.sql'])this.db.raw.exec(readFileSync(new URL('../../../db/migrations/'+name,import.meta.url),'utf8'));}
 authenticate(request,now=Date.now()){
  const token=/^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(request.headers.get('authorization')||'');
  if(!token)fail('UNAUTHENTICATED',401);
  const digest=createHash('sha256').update(token[1]).digest('hex');
  const row=this.db.get('SELECT wallet,expires_at FROM identity_sessions WHERE token_hash=?',digest);
  if(!row||row.expires_at<=now)fail('UNAUTHENTICATED',401);return row.wallet.toLowerCase();
 }
 seats(ventureId){return this.db.all(`SELECT s.wallet,s.world_status,s.onchain_status,w.environment,w.protocol_version
 FROM identity_seats s LEFT JOIN identity_world_nullifiers w ON w.venture_id=s.venture_id AND w.wallet=s.wallet
 WHERE s.venture_id=?`,ventureId);}
 member(ventureId,wallet){if(!this.seats(ventureId).some(s=>s.wallet===wallet))fail('FORBIDDEN',403);}
 source(ventureId){const seats=this.seats(ventureId);return seats.length===2&&seats.every(s=>s.environment==='production'&&s.world_status==='VERIFIED')?'WORLD_PRODUCTION':seats.some(s=>s.environment==='staging')?'TESTED_IN_SIMULATOR':'UNKNOWN';}
 reserve({wallet,route,key,digest,ventureId,kind,source}){
  return this.db.tx(()=>{
   const existing=this.db.get('SELECT * FROM treasury_idempotency WHERE wallet=? AND route=? AND idempotency_key=?',wallet,route,key);
   if(existing){if(existing.body_digest!==digest)fail('IDEMPOTENCY_CONFLICT',409);return {replay:true,response:JSON.parse(existing.response_json),status:existing.http_status};}
   const id=randomUUID();const response={operationId:id,status:'RESERVED'};
   this.db.run('INSERT INTO treasury_operations(operation_id,venture_id,actor,kind,status,source,created_at) VALUES(?,?,?,?,?,?,?)',id,ventureId,wallet,kind,'RESERVED',source,Date.now());
   this.db.run('INSERT INTO treasury_idempotency VALUES(?,?,?,?,?,?,?)',wallet,route,key,digest,id,JSON.stringify(response),202);
   return {replay:false,response,status:202};
  });
 }
 settle(id,response,status=200){this.db.run('UPDATE treasury_idempotency SET response_json=?,http_status=? WHERE operation_id=?',JSON.stringify(response),status,id);}
 operations(ventureId,actor){return this.db.all('SELECT operation_id AS operationId,status,tx_hash AS txHash,block_number AS blockNumber,block_hash AS blockHash,source,error_code AS error FROM treasury_operations WHERE venture_id=?'+(actor?' AND actor=?':'')+' ORDER BY created_at',...([ventureId,...(actor?[actor]:[])]));}
}
/** Same synchronous SqlDb surface C1 exposes; no identity tables are created or modified here. */
export function openTreasuryStore(path){
 const raw=new DatabaseSync(path);raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 let inTx=false;
 const db={raw,run:(sql,...args)=>({changes:Number(raw.prepare(sql).run(...args).changes)}),get:(sql,...args)=>raw.prepare(sql).get(...args),all:(sql,...args)=>raw.prepare(sql).all(...args),tx:fn=>{if(inTx)return fn();raw.exec('BEGIN IMMEDIATE');inTx=true;try{const out=fn();raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}finally{inTx=false;}}};
 const store=new TreasuryStore(db);store.migrate();return store;
}
