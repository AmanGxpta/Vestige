// H-approved one-off operator relay session (2026-11-07, chain 1874, northstar only).
// Scope: USDT transferWithAuthorization -> token, and execTransaction -> northstar Safe. Nothing else.
// Usage: node script/treasury/relay-session.mjs fund|pay <request.json>
// The relayer key is decrypted from the local keystore into this process only; never printed.
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../src/modules/treasury/package.json',import.meta.url));
const {createPublicClient,http,keccak256}=require('viem');const {privateKeyToAccount}=require('viem/accounts');
const {loadManifest,adaptDeploymentManifest}=await import('../../src/modules/treasury/manifest.mjs');
const {RestrictedRelayer}=await import('../../src/modules/relayer/relayer.mjs');
const {RpcIO}=await import('../../src/modules/relayer/rpc-io.mjs');
const {FileJournal}=await import('../../src/modules/relayer/journal.mjs');
const {RelaySafety,AlertHooks,limitsDigest}=await import('../../src/modules/relayer/safety.mjs');
const {operators}=await import('../../src/modules/treasury/deployment-plan.mjs');
const RPC='https://rpc.testnet.whitechain.io',SESSION=process.env.RELAY_SESSION_DIR;
if(!SESSION)throw new Error('RELAY_SESSION_DIR_REQUIRED');
export const SESSION_LIMITS={dailyBudgetWei:10_000_000_000_000_000n,maxGas:300000n,maxGasPrice:10_000_000_000n,l1FeeReserveWei:1_000_000_000_000n,minBalanceWei:2_000_000_000_000_000n,maxPerMinute:3};
const SELECTORS={fund:'0xcf092995',pay:'0x6a761202'}; // transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes); execTransaction
const [mode,requestPath]=process.argv.slice(2);if(!(SELECTORS[mode]||mode==='confirm')||!requestPath)throw new Error('USAGE'); // confirm <journal id>: receipt reconciliation only, never signs
const m=await loadManifest('contracts/manifests/whitechain-1874/northstar.vestige.eth.json');const {manifest,token}=adaptDeploymentManifest(m);
const client=createPublicClient({transport:http(RPC)});
function relayerKey(){
 const pw=execFileSync('security',['find-generic-password','-a',process.env.USER,'-s','vestige-relayer-keystore','-w'],{encoding:'utf8'}).trim();
 const out=execFileSync('cast',['wallet','decrypt-keystore','-k',process.env.HOME+'/.vestige/keystores','vestige-relayer'],{encoding:'utf8',env:{...process.env,CAST_UNSAFE_PASSWORD:pw},stdio:['ignore','pipe','ignore']});
 const key=out.trim().split(/\s+/).pop();if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw new Error('RELAYER_KEY_UNAVAILABLE');return key;
}
const account=privateKeyToAccount(relayerKey());
if(account.address.toLowerCase()!==operators.relayer.toLowerCase())throw new Error('RELAYER_ADDRESS_MISMATCH');
// Independent signer allowlist: exact target + selector for this mode only, zero value, bounded gas/price.
const send=async call=>{
 if(!SELECTORS[mode])throw new Error('SIGNER_SCOPE_REFUSED');
 const target=mode==='fund'?token.address:manifest.safe;
 if(call.to.toLowerCase()!==target.toLowerCase()||call.data.slice(0,10)!==SELECTORS[mode]||(call.value??0n)!==0n)throw new Error('SIGNER_SCOPE_REFUSED');
 if(call.gas>SESSION_LIMITS.maxGas||call.gasPrice>SESSION_LIMITS.maxGasPrice||await client.getChainId()!==1874)throw new Error('SIGNER_BOUNDS_REFUSED');
 const raw=await account.signTransaction({chainId:1874,type:'legacy',to:call.to,data:call.data,value:0n,nonce:call.nonce,gas:call.gas,gasPrice:call.gasPrice});
 await appendFile(SESSION+'/sent.jsonl',JSON.stringify({mode,to:call.to,callHash:keccak256(call.data),nonce:call.nonce,gas:String(call.gas),gasPrice:String(call.gasPrice),at:new Date().toISOString()})+'\n');
 return client.sendRawTransaction({serializedTransaction:raw});
};
const io=new RpcIO({client,sender:account.address,send});
const review=JSON.parse(await readFile(new URL('./relay-session-review.json',import.meta.url),'utf8'));
if(review.limitsDigest!==limitsDigest(SESSION_LIMITS))throw new Error('SESSION_REVIEW_DIGEST_MISMATCH');
const alerts=new AlertHooks(async body=>{await appendFile(SESSION+'/alerts.jsonl',JSON.stringify({...body,at:new Date().toISOString()})+'\n');return true;});
const safety=new RelaySafety({review,alerts,roles:{deployer:operators.deployer,registrar:operators.registrar}});
await mkdir(SESSION,{recursive:true,mode:0o700});
const relay=new RestrictedRelayer({manifests:[manifest],token,io,journal:new FileJournal(SESSION+'/journal.json'),limits:SESSION_LIMITS,safety,enabled:true});
const j=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
const settle=async id=>{for(let i=0;i<90;i++){try{const c=await relay.confirm(id);console.log(j(c));await writeFile(SESSION+`/${mode}-${id.split(':')[0]}-confirm.json`,j(c));return c;}
 catch(e){if(e.message!=='RECEIPT_PENDING'&&!/could not be found/i.test(e.message))throw e;await new Promise(r=>setTimeout(r,2000));}}throw new Error('CONFIRM_TIMEOUT');};
if(mode==='confirm'){await settle(requestPath);process.exit(0);}
const req=JSON.parse(await readFile(requestPath,'utf8'));
const big=x=>BigInt(x);
const result=mode==='fund'
 ?await relay.fund({ventureId:m.ventureId,from:req.from,to:manifest.safe,value:big(req.value),validAfter:big(req.validAfter),validBefore:big(req.validBefore),nonce:req.nonce,signature:req.signature})
 :await relay.execute({ventureId:m.ventureId,recipient:req.recipient,amount:big(req.amountRaw),nonce:big(req.safeNonce),signatures:req.signatures});
console.log(j(result));
await settle(result.id); // Journal-updating relayer confirmation (EXECUTED/FAILED), >=2 confirmations.
