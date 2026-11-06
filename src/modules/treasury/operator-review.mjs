import {createPublicClient,http,getContractAddress,encodeAbiParameters,keccak256} from 'viem';
import {operators} from './deployment-plan.mjs';
import {anchors} from './manifest.mjs';
/** No signing: snapshot public nonce/gas/code only, no keystore access. */
export async function infrastructureReview(rpc='https://rpc.testnet.whitechain.io'){
 const client=createPublicClient({transport:http(rpc)});if(await client.getChainId()!==1874)throw new Error('WRONG_CHAIN');
 const block=await client.getBlock({blockTag:'latest'});
 const [nonce,pending,balance,gasPrice]=await Promise.all([client.getTransactionCount({address:operators.deployer,blockNumber:block.number}),client.getTransactionCount({address:operators.deployer,blockTag:'pending'}),client.getBalance({address:operators.deployer,blockNumber:block.number}),client.getGasPrice()]);
 if(nonce!==pending)throw new Error('DEPLOYER_NONCE_LOCK');
 const registry=getContractAddress({from:operators.deployer,nonce:BigInt(nonce)}),setup=getContractAddress({from:operators.deployer,nonce:BigInt(nonce+1)});
 const expected={singleton:'0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff',factory:'0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317'};const codeHashes={};
 for(const name of ['singleton','factory']){const code=await client.getCode({address:anchors[name],blockNumber:block.number});if(!code||keccak256(code)!==expected[name])throw new Error('CANONICAL_CODE_DRIFT');codeHashes[name]=expected[name];}
 for(const address of [registry,setup]){const code=await client.getCode({address,blockNumber:block.number});if(code&&code!=='0x')throw new Error('PREDICTED_ADDRESS_ALREADY_HAS_CODE');}
 return {kind:'INFRASTRUCTURE_REVIEW_PLAN',codeHashes,chainId:1874,observedAt:new Date().toISOString(),blockNumber:String(block.number),blockHash:block.hash,
  sender:operators.deployer,nonce,pendingNonce:pending,wbtWei:String(balance),gasPriceWei:String(gasPrice),broadcastAuthorized:false,
  deployments:[{contract:'contracts/SeatRegistry.sol:SeatRegistry',nonce,predictedAddress:registry,constructorArgs:[operators.attester],encodedConstructorArgs:encodeAbiParameters([{type:'address'}],[operators.attester]),proposedGasCeiling:'400000'},
   {contract:'contracts/SafeSetup.sol:SafeSetup',nonce:nonce+1,predictedAddress:setup,constructorArgs:[anchors.singleton],encodedConstructorArgs:encodeAbiParameters([{type:'address'}],[anchors.singleton]),proposedGasCeiling:'2500000'}],
  verification:{compiler:'v0.8.24+commit.e11b9ed9',optimizer:true,runs:200,evmVersion:'paris',verifier:'blockscout',url:'https://explorer.testnet.whitechain.io/api/'},
  approvalRequired:['source/build','bounded funding','gas ceilings vs simulation','OP L1 measured policy','exact nonce/constructors before any signing'],
  warning:'Predicted addresses are not deployed contracts. No receipt/manifest exists.'};
}
export async function publicFundingRead(rpc='https://rpc.testnet.whitechain.io'){
 const client=createPublicClient({transport:http(rpc)});if(await client.getChainId()!==1874)throw new Error('WRONG_CHAIN');
 const block=await client.getBlock({blockTag:'latest'}),wallets={};
 const roles={deployer:operators.deployer,attester:operators.attester,relayer:operators.relayer,funder:'0xD613312b630C9359EcE15dBF3969c47261d8d43A',payee:'0xabDC5035CEa855Ec7Cf8A7259eA26E131f0BA8D8',failedTx:'0xd03ce7DAE6c4B75fE26213Cb08CEB9286D1FC852'};
 for(const [role,address]of Object.entries(roles))wallets[role]={address,wbtWei:String(await client.getBalance({address,blockNumber:block.number})),nonce:await client.getTransactionCount({address,blockNumber:block.number})};
 const data='0x70a08231'+roles.funder.slice(2).padStart(64,'0');const response=await client.call({to:anchors.token,data,blockNumber:block.number});wallets.funder.usdtRaw=String(BigInt(response.data));
 return {claim:'READ_ONLY_PUBLIC_BALANCES',chainId:1874,at:new Date().toISOString(),blockNumber:String(block.number),blockHash:block.hash,wallets,broadcastAuthorized:false};
}
