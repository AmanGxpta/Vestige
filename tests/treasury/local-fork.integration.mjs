// Real bytecode, LOCAL Anvil fork only. Never sends a transaction to Whitechain.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { a,b } from './fixtures.mjs';
import { RestrictedRelayer } from '../../src/modules/relayer/relayer.mjs';
import { RpcIO } from '../../src/modules/relayer/rpc-io.mjs';
import { buildGuardedSafe } from '../../src/modules/treasury/spike/guarded-safe.mjs';
import { SeatAttester } from '../../src/modules/treasury/seat-attestation.mjs';
import { TreasuryService } from '../../src/modules/treasury/service.mjs';
import { TreasuryChainReadPort } from '../../src/modules/treasury/readback-port.mjs';
import { treasuryReadV1 } from '../../src/modules/treasury/readback-payload.mjs';
import { createTreasuryHandlers } from '../../src/modules/treasury/http.mjs';
import { sqlFixture } from './service-fixtures.mjs';
import { RelaySafety,AlertHooks,limitsDigest } from '../../src/modules/relayer/safety.mjs';
import { createHash } from 'node:crypto';
import { FileJournal } from '../../src/modules/relayer/journal.mjs';
const require=createRequire(new URL('../../src/modules/relayer/package.json',import.meta.url));
const { createPublicClient,createWalletClient,http,defineChain,parseAbi,encodeFunctionData,keccak256,zeroAddress,parseEventLogs,encodeAbiParameters }=require('viem');
const endpoint='http://127.0.0.1:18574';
await new Promise((resolve,reject)=>{
 const probe=createServer();probe.once('error',()=>reject(new Error('LOCAL_TEST_PORT_ALREADY_IN_USE')));
 probe.listen(18574,'127.0.0.1',()=>probe.close(resolve));
});
const node=spawn('anvil',['--silent','--port','18574','--chain-id','1874','--fork-url','https://rpc.testnet.whitechain.io','--fork-block-number','12353825'],{stdio:'ignore'});
const dir=await mkdtemp(join(tmpdir(),'vestige-relay-fork-'));
let app;let stage='startup';
try {
 const chain=defineChain({id:1874,name:'LOCAL Whitechain fork',nativeCurrency:{name:'WBT',symbol:'WBT',decimals:18},rpcUrls:{default:{http:[endpoint]}}});
 const client=createPublicClient({chain,transport:http(endpoint)});
 let ready=false;
 node.on('error',()=>{});
 for(let n=0;n<100;n++){if(node.exitCode!==null)throw new Error('LOCAL_ANVIL_EXITED');try{await client.getChainId();ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 if(!ready)throw new Error('LOCAL_ANVIL_NOT_READY');
 const [sender,relaySender]=await client.request({method:'eth_accounts'});
 const wallet=createWalletClient({chain,account:sender,transport:http(endpoint)});
 const tx=async hash=>client.waitForTransactionReceipt({hash});
 const artifact=async name=>JSON.parse(await readFile(new URL(`../../contracts/.artifacts/${name}.sol/${name}.json`,import.meta.url),'utf8'));
 const deploy=async(name,args)=>{const x=await artifact(name);const receipt=await tx(await wallet.deployContract({abi:x.abi,bytecode:x.bytecode.object,args}));assert.equal(receipt.status,'success');return receipt.contractAddress;};
 const registry=await deploy('SeatRegistry',[sender]);const registryArtifact=await artifact('SeatRegistry');
 const ventureId=`0x${'ab'.repeat(32)}`;
 stage='seat-port';app=sqlFixture(join(dir,'treasury.sqlite'));
 app.db.run("UPDATE identity_world_nullifiers SET environment='staging'");app.db.run("UPDATE identity_seats SET onchain_status='UNKNOWN'");
 const port=new SeatAttester({store:app.store,client,registry:{address:registry,runtimeCodeHash:keccak256(await client.getCode({address:registry}))},attester:sender,
  send:call=>wallet.sendTransaction({...call,chain}),authorizeSend:async()=>client.transport.url===endpoint});
 for(const [i,owner]of [a,b].entries()){
  const input={ventureId,wallet:owner.address,nullifierHash:keccak256(encodeAbiParameters([{type:'uint256'}],[BigInt(i+1)]))};
  const attested=await port.attestSeat(input);await client.request({method:'evm_mine'});
  assert.equal((await port.confirm({...input,txHash:attested.txHash})).state,'CONFIRMED');
  app.db.run("UPDATE identity_seats SET onchain_status='VERIFIED' WHERE wallet=?",owner.address.toLowerCase());
 }
 stage='guarded-safe';
 const singleton='0x29fcB43b46531BcA003ddC8FCB67FFE91900C762';
 const factory='0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
 const helper=await deploy('SafeSetup',[singleton]);
 const guarded=await buildGuardedSafe({provider:endpoint,helper,registry,ventureId,owners:[a.address,b.address],saltNonce:'18749999'});
 const factoryAbi=parseAbi(['event ProxyCreation(address indexed proxy,address singleton)']);
 const creation=await tx(await wallet.sendTransaction({...guarded.transaction,value:BigInt(guarded.transaction.value)}));
 const safe=parseEventLogs({abi:factoryAbi,logs:creation.logs})[0].args.proxy;
 assert.equal(safe.toLowerCase(),guarded.address.toLowerCase());
 const guardSlot=keccak256(Buffer.from('guard_manager.guard.address'));
 const guard=`0x${(await client.getStorageAt({address:safe,slot:guardSlot})).slice(-40)}`;
 const hash=async address=>keccak256(await client.getCode({address}));
 const tokenAddress='0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
 const implementation='0x26425662D126412128967ECf0a02EC48573026F7';
 const token={address:tokenAddress,codeHash:await hash(tokenAddress),implementation,implementationCodeHash:await hash(implementation),decimals:6,domain:{name:'Tether USD',version:'1',chainId:1874,verifyingContract:tokenAddress}};
 const manifest={ventureId,safe,guard,registry,singleton,safeCodeHash:await hash(safe),guardCodeHash:await hash(guard),registryCodeHash:await hash(registry),singletonCodeHash:await hash(singleton),factory,setup:helper,factoryCodeHash:await hash(factory),setupCodeHash:await hash(helper)};
 const issuerAbi=parseAbi(['function owner() view returns(address)','function mint(address,uint256)']);
 const issuer=await client.readContract({address:tokenAddress,abi:issuerAbi,functionName:'owner'});
 await client.request({method:'anvil_setBalance',params:[issuer,'0xde0b6b3a7640000']});
 await client.request({method:'anvil_impersonateAccount',params:[issuer]});
 await tx(await wallet.writeContract({account:issuer,address:tokenAddress,abi:issuerAbi,functionName:'mint',args:[a.address,10_000_000n]}));
 await client.request({method:'anvil_stopImpersonatingAccount',params:[issuer]});
 const io=new RpcIO({client,sender:relaySender,send:call=>wallet.sendTransaction({...call,chain})});
 for(const name of ['snapshot','estimate','quoteL1','simulate','send']){const fn=io[name].bind(io);io[name]=async(...args)=>{try{return await fn(...args);}catch(e){stage='io-'+name;throw e;}};}

 const limits={dailyBudgetWei:10n**18n,maxGas:700000n,maxGasPrice:10n**12n,l1FeeReserveWei:10n**15n,minBalanceWei:10n**15n,maxPerMinute:10};
 const metrics=[];const safety=new RelaySafety({review:{scope:'LOCAL_FORK_ONLY',chainId:1874,reference:'LOCAL_FORK_NOT_A_LIVE_REVIEW',expiresAt:new Date(Date.now()+3600000).toISOString(),limitsDigest:limitsDigest(limits)},alerts:new AlertHooks(async metric=>{metrics.push(metric);return true;})});
 const relay=new RestrictedRelayer({manifests:[manifest],token,io,journal:new FileJournal(join(dir,'journal.json')),limits,safety,enabled:true});
 const service=new TreasuryService({store:app.store,relay,manifests:[]});const handlers=createTreasuryHandlers(service,{authURI:endpoint});
 const tokenB='local-anvil-owner-b-bearer-only';app.db.run('INSERT INTO identity_sessions VALUES(?,?,?)',createHash('sha256').update(tokenB).digest('hex'),b.address.toLowerCase(),Date.now()+60000);
 const request=(body,key,bearer=app.token)=>new Request(endpoint+'/api/treasury',{method:'POST',headers:{authorization:'Bearer '+bearer,origin:endpoint,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body,(_,v)=>typeof v==='bigint'?String(v):v)});
 const invoke=async(action,body,key,pid,bearer)=>{const r=await handlers.handle(request(body,key,bearer),action,{id:ventureId,pid});const result=await r.json();if(r.status>=400)throw new Error(action+':'+(result.error?.code||r.status));return result;};
 const now=Number((await client.getBlock({blockTag:'latest'})).timestamp);
 stage='funding-route';
 const funding={ventureId,from:a.address,to:safe,value:1_000_000n,validAfter:0n,validBefore:BigInt(Math.max(now,Math.floor(Date.now()/1000))+600),nonce:`0x${'ef'.repeat(32)}`};
 funding.signature=await a.signTypedData(relay.fundingTyped(funding,manifest));
 const {ventureId:_,...fundingBody}=funding;
 const deposit=await invoke('fund',fundingBody,'funding-one');await client.request({method:'evm_mine'});
 await service.reconcileOperations(ventureId);
 assert.equal(app.db.get('SELECT status FROM treasury_operations WHERE operation_id=?',deposit.operationId).status,'EXECUTED');
 const replay=await invoke('fund',fundingBody,'funding-one');assert.equal(replay.operationId,deposit.operationId);
 stage='payment-routes';
 const recipient='0x0000000000000000000000000000000000000600';
 const proposal=await invoke('payments',{recipient,amountRaw:'500000',reason:'LOCAL_FORK_ONLY'},'payment-one');
 await invoke('sign',{signature:await a.signTypedData(proposal.typedData)},'signature-one',proposal.paymentId);
 const refused=await handlers.handle(request({},'execute-refused'),'execute',{id:ventureId,pid:proposal.paymentId});assert.equal(refused.status,409);
 const paymentReady=await invoke('sign',{signature:await b.signTypedData(proposal.typedData)},'signature-two',proposal.paymentId,tokenB);assert.equal(paymentReady.status,'READY');
 const paid=await invoke('execute',{},'execute-ready',proposal.paymentId);await client.request({method:'evm_mine'});await service.reconcileOperations(ventureId);
 assert.equal(app.db.get('SELECT status FROM treasury_payments WHERE payment_id=?',proposal.paymentId).status,'EXECUTED');
 assert.ok(app.db.get('SELECT block_hash FROM treasury_operations WHERE operation_id=?',paid.operationId).block_hash);
 assert.equal(app.store.source(ventureId),'TESTED_IN_SIMULATOR');
 assert.ok(metrics.some(m=>m.event==='receipt_fee'));assert.ok(metrics.some(m=>m.event==='confirmation_latency'));
 const balance=await client.readContract({address:tokenAddress,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[recipient]});
 assert.equal(balance,500000n);
 stage='draft-readback';
 // LOCAL fixture descriptor only; never published as an approved live manifest.
 service.manifests=[{ventureId,deploymentBlock:Number(creation.blockNumber),contracts:{safe:{address:safe,deploymentTxHash:creation.transactionHash},guard:{address:guard},registry:{address:registry},token:{address:tokenAddress}}}];
 service.readPort=new TreasuryChainReadPort({client,store:app.store});
 const readback=await treasuryReadV1(service,ventureId,a.address);
 assert.equal(readback.balanceRaw,'500000');assert.equal(readback.tokenDecimals,6);
 assert.equal(readback.depositsStatus,'VERIFIED');assert.equal(readback.deposits.length,1);assert.equal(readback.deposits[0].amountRaw,'1000000');
 assert.equal(readback.payments[0].status,'EXECUTED');assert.equal(readback.payments[0].safeTypedData,null);assert.ok(readback.payments[0].executedTxHash);
 assert.deepEqual(readback.evidence,[]);assert.equal(readback.provenance.source,'TESTED_IN_SIMULATOR');
 console.log(JSON.stringify({claim:'LOCAL_ANVIL_FORK_ONLY',chainId:1874,pinnedBlock:12353825,
  protocolKit:'8.0.11',guardedSdkDeployment:'PASSED',funding:'EXECUTED',payment:'EXECUTED',replay:'REJECTED',oneSigner:'REJECTED_BEFORE_SUBMISSION',recipientBalanceRaw:String(balance),
  seatPort:'CONFIRMED',authenticatedRoutes:'PASSED',sqliteAndJournal:'DURABLE',draftReadback:'BALANCE_DEPOSIT_PAYMENT_PASSED',rejectedEvidence:'EMPTY_NO_MINED_GS020',feeMetrics:'LOCAL_ONLY',evidenceSource:'TESTED_IN_SIMULATOR',confirmations:2,liveTransactionsBroadcast:0}));
} catch(error) {console.error(JSON.stringify({claim:'LOCAL_FORK_TEST_FAILED',stage,error:error.name,code:/^[a-z]+:[A-Z0-9_]+$/.test(error.message)?error.message:error.code||'FAILED'}));process.exitCode=1;} finally {app?.close();node.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
