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
import { FileJournal } from '../../src/modules/relayer/journal.mjs';
const require=createRequire(new URL('../../src/modules/relayer/package.json',import.meta.url));
const { createPublicClient,createWalletClient,http,defineChain,parseAbi,encodeFunctionData,keccak256,zeroAddress,parseEventLogs }=require('viem');
const endpoint='http://127.0.0.1:18574';
await new Promise((resolve,reject)=>{
 const probe=createServer();probe.once('error',()=>reject(new Error('LOCAL_TEST_PORT_ALREADY_IN_USE')));
 probe.listen(18574,'127.0.0.1',()=>probe.close(resolve));
});
const node=spawn('anvil',['--silent','--port','18574','--chain-id','1874','--fork-url','https://rpc.testnet.whitechain.io','--fork-block-number','12353825'],{stdio:'ignore'});
const dir=await mkdtemp(join(tmpdir(),'vestige-relay-fork-'));
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
 for(const [i,owner]of [a,b].entries())await tx(await wallet.writeContract({address:registry,abi:registryArtifact.abi,functionName:'attestSeat',args:[ventureId,owner.address,`0x${(i+1).toString(16).padStart(64,'0')}`]}));
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
 const manifest={ventureId,safe,guard,registry,singleton,safeCodeHash:await hash(safe),guardCodeHash:await hash(guard),registryCodeHash:await hash(registry),singletonCodeHash:await hash(singleton)};
 const issuerAbi=parseAbi(['function owner() view returns(address)','function mint(address,uint256)']);
 const issuer=await client.readContract({address:tokenAddress,abi:issuerAbi,functionName:'owner'});
 await client.request({method:'anvil_setBalance',params:[issuer,'0xde0b6b3a7640000']});
 await client.request({method:'anvil_impersonateAccount',params:[issuer]});
 await tx(await wallet.writeContract({account:issuer,address:tokenAddress,abi:issuerAbi,functionName:'mint',args:[a.address,10_000_000n]}));
 await client.request({method:'anvil_stopImpersonatingAccount',params:[issuer]});
 const io=new RpcIO({client,sender:relaySender,send:call=>wallet.sendTransaction({...call,chain})});
 const now=Number((await client.getBlock()).timestamp);
 const relay=new RestrictedRelayer({manifests:[manifest],token,io,journal:new FileJournal(join(dir,'journal.json')),
   now:()=>now,limits:{dailyBudgetWei:10n**18n,maxGas:700000n,maxGasPrice:10n**12n,l1FeeReserveWei:10n**15n,minBalanceWei:10n**15n,maxPerMinute:10}});
 const funding={ventureId,from:a.address,to:safe,value:1_000_000n,validAfter:BigInt(now-1),validBefore:BigInt(now+600),nonce:`0x${'ef'.repeat(32)}`};
 funding.signature=await a.signTypedData(relay.fundingTyped(funding,manifest));
 const deposit=await relay.fund(funding);await client.request({method:'evm_mine'});
 assert.equal((await relay.confirm(deposit.id)).status,'EXECUTED');
 await assert.rejects(relay.fund(funding),/DUPLICATE_OR_PENDING/);
 const recipient='0x0000000000000000000000000000000000000600';
 const payment={ventureId,recipient,amount:500000n,nonce:0n};
 const typed=relay.paymentTyped(payment,manifest);payment.signatures=[await a.signTypedData(typed)];
 await assert.rejects(relay.execute(payment),/TWO_SIGNATURES_REQUIRED/);
 payment.signatures.push(await b.signTypedData(typed));
 const paid=await relay.execute(payment);await client.request({method:'evm_mine'});
 assert.equal((await relay.confirm(paid.id)).status,'EXECUTED');
 const balance=await client.readContract({address:tokenAddress,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[recipient]});
 assert.equal(balance,500000n);
 console.log(JSON.stringify({claim:'LOCAL_ANVIL_FORK_ONLY',chainId:1874,pinnedBlock:12353825,
  protocolKit:'8.0.11',guardedSdkDeployment:'PASSED',funding:'EXECUTED',payment:'EXECUTED',replay:'REJECTED',oneSigner:'REJECTED_BEFORE_SUBMISSION',recipientBalanceRaw:String(balance),
  confirmations:2,liveTransactionsBroadcast:0}));
} finally {node.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
