import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../src/modules/treasury/package.json',import.meta.url));
const {build}=require('esbuild');
export const pins={identity:'991f524ebab059337b953cc3c142c5c5aa330632',product:'474256609570ba11085701f5db107127deaef780'};
const root=fileURLToPath(new URL('../../../',import.meta.url));
const cache=join(root,'tests/treasury/.cross-owner-cache');
export async function materialize(){
 await mkdir(cache,{recursive:true});const inputs={};
 for(const [name,ref]of Object.entries(pins)){
  const sha=execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim();
  const dir=join(cache,name+'-'+sha);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
  const paths=name==='identity'?['src/modules/identity','src/modules/agreements','db/migrations']:['src/modules/ui'];
  const archive=execFileSync('git',['archive',sha,...paths],{cwd:root});execFileSync('tar',['-x','-C',dir],{input:archive});
  inputs[name]={sha,dir};
 }
 const bundle=async(name,source)=>{
  const entry=join(cache,name+'.entry.ts'),out=join(root,'src/modules/treasury/node_modules/.cache-vestige-'+name+'.mjs');
  await writeFile(entry,source);
  await build({entryPoints:[entry],outfile:out,bundle:true,platform:'node',format:'esm',target:'node26',packages:'external',nodePaths:[join(root,'src/modules/treasury/node_modules')],logLevel:'silent',...(name==='c1'?{define:{'import.meta.url':JSON.stringify(pathToFileURL(join(inputs.identity.dir,'src/modules/identity/db.ts')).href)}}:{})});
  return import(new URL('file://'+out).href+'?'+Date.now());
 };
 const c1=inputs.identity.dir;
 const identity=await bundle('c1',`export {SqliteDb,migrateIdentity} from ${JSON.stringify(join(c1,'src/modules/identity/db.ts'))};\nexport {AuthService} from ${JSON.stringify(join(c1,'src/modules/identity/auth.ts'))};\nexport {VentureService} from ${JSON.stringify(join(c1,'src/modules/identity/ventures.ts'))};\nexport {AgreementService} from ${JSON.stringify(join(c1,'src/modules/agreements/service.ts'))};\nexport {handlers} from ${JSON.stringify(join(c1,'src/modules/identity/http.ts'))};\nexport {UnconfiguredPort} from ${JSON.stringify(join(c1,'src/modules/identity/ports.ts'))};\nexport {registerSeatAttester,getIdentityServices} from ${JSON.stringify(join(c1,'src/modules/identity/container.ts'))};`);
 const c2path=join(inputs.product.dir,'src/modules/ui/live-adapter.ts');
 const original=await readFile(c2path,'utf8');
 const originalHash=createHash('sha256').update(original).digest('hex');
 const originalProduct=await bundle('c2-baseline',`export {createLiveAdapter,toTreasuryState} from ${JSON.stringify(c2path)};`);
 return {identity,product:originalProduct,inputs,originalHash,bundle,c2path,original,root};
}
export async function candidateProduct(modules){
 let source=modules.original;
 const swaps=[
 ['  const proposalTypedData = new Map<string, unknown>();\n',''],
 ['    for (const p of t.payments) if (!p.safeTypedData && proposalTypedData.has(p.paymentId)) p.safeTypedData = proposalTypedData.get(p.paymentId);\n',''],
 ['<{ paymentId?: string; typedData?: unknown }>','<{ paymentId?: string; safeTypedData?: unknown }>'],
 ['      if (r.value.paymentId && r.value.typedData) proposalTypedData.set(r.value.paymentId, r.value.typedData);\n',''],
 ['      ...(p.typedData || p.safeTypedData ? { safeTypedData: p.typedData ?? p.safeTypedData } : {}),','      safeTypedData: p.safeTypedData ?? null,\n      relay: p.relay ?? null,'],
 ['    deposits: Array.isArray(raw.deposits)', '    depositsStatus: raw.depositsStatus ?? "UNKNOWN",\n    deposits: Array.isArray(raw.deposits)']
 ];
 for(const [from,to]of swaps){if(source.split(from).length!==2)throw new Error('C2_PATCH_CONTEXT_CHANGED');source=source.replace(from,to);}
 const baseline=modules.c2path+'.baseline';await writeFile(baseline,modules.original);await writeFile(modules.c2path,source);
 let patch;try{patch=execFileSync('diff',['-u','--label','a/src/modules/ui/live-adapter.ts',baseline,'--label','b/src/modules/ui/live-adapter.ts',modules.c2path],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;patch=String(e.stdout);}
 await writeFile(join(modules.root,'docs/agent-reports/treasury/2026-11-07-c2-treasury-caller.patch'),patch);
 return modules.bundle('c2-candidate',`export {createLiveAdapter,toTreasuryState} from ${JSON.stringify(modules.c2path)};`);
}
