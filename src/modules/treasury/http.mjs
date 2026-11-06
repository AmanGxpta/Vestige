import {createHash} from 'node:crypto';
import {TreasuryError,fail} from './store.mjs';
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
const response=(value,status=200)=>new Response(stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
 let data='';const decoder=new TextDecoder('utf-8',{fatal:true});if(request.body){const reader=request.body.getReader();let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail('BODY_TOO_LARGE',413);}try{data+=decoder.decode(value,{stream:true});}catch{fail('INVALID_UTF8');}}}
 try{data+=decoder.decode();}catch{fail('INVALID_UTF8');}
 let parsed;try{parsed=JSON.parse(data||'{}');}catch{fail('INVALID_JSON');}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')fail('INVALID_BODY');return parsed;
}
export function createTreasuryHandlers(service,{authURI,authenticate=service.authenticate||((request)=>service.store.authenticate(request))}){
 const configured=new URL(authURI);if(configured.username||configured.password||!(configured.protocol==='https:'||configured.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(configured.hostname)))throw new Error('HTTPS_AUTH_ORIGIN_REQUIRED');
 const origin=configured.origin;
 return {async handle(request,action,{id,pid}={}){
  try{
   if(!/^0x[0-9a-f]{64}$/.test(id||''))fail('INVALID_VENTURE_ID');
   const mutation=request.method!=='GET';
   const actor=mutation||request.headers.has('authorization')?await authenticate(request):null;
   if(!mutation)return response(await service.read(id,actor));
   if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_MISMATCH',403);
   const key=request.headers.get('idempotency-key');if(!key||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))fail('IDEMPOTENCY_KEY_REQUIRED');
   const value=await body(request);
   const allowed={deploy:[],fund:['from','to','value','validAfter','validBefore','nonce','signature'],payments:['recipient','amountRaw','reason'],sign:['signature'],execute:[]}[action];
   if(!allowed||Object.keys(value).some(k=>!allowed.includes(k)))fail('INVALID_BODY');
   if(pid&&!/^[0-9a-f-]{36}$/.test(pid))fail('INVALID_PAYMENT_ID');
   if(action!=='fund')service.store.member(id,actor);
   const route=`${action}:${id}:${pid||''}`;
   const digest=createHash('sha256').update(stringify(canonical(value))).digest('hex');
   const reserved=service.store.reserve({wallet:actor,route,key,digest,ventureId:id,kind:action,source:service.store.source(id)});
   if(reserved.replay)return response(reserved.response,reserved.status);
   const operationId=reserved.response.operationId;
   try{
    const result=await service.mutate(action,{id,pid,actor,body:value,operationId});
    service.store.settle(operationId,result,action==='deploy'?202:200);
    return response(result,action==='deploy'?202:200);
   }catch(e){
    const code=e instanceof TreasuryError?e.code:/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message||'')?e.message:'SERVICE_UNAVAILABLE';
    const unknown=code.includes('UNKNOWN');
    service.store.db.run('UPDATE treasury_operations SET status=?,error_code=? WHERE operation_id=?',unknown?'UNKNOWN':'FAILED',code,operationId);
    const result={operationId,status:unknown?'UNKNOWN':'FAILED',error:{code,message:code}};
    service.store.settle(operationId,result,e.status||503);return response(result,e.status||503);
   }
  }catch(e){const code=e instanceof TreasuryError?e.code:'SERVICE_UNAVAILABLE';return response({error:{code,message:code}},e.status||503);}
 }};
}
