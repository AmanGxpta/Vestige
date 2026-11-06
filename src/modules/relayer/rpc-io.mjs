import { decodeFunctionResult, keccak256, parseAbi, parseEventLogs, zeroAddress, hashDomain } from 'viem';
import { tokenAbi, safeAbi } from './relayer.mjs';

const readAbi = parseAbi([
  'function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)',
  'function getModulesPaginated(address start,uint256 pageSize) view returns (address[],address)',
  'function getStorageAt(uint256 offset,uint256 length) view returns (bytes)', 'function nonce() view returns (uint256)',
  'function safe() view returns (address)', 'function registry() view returns (address)', 'function ventureId() view returns (bytes32)',
  'function attester() view returns (address)',
  'function isSeat(bytes32 venture,address wallet) view returns (bool)', 'function decimals() view returns (uint8)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)', 'function balanceOf(address wallet) view returns (uint256)',
]);
const events = parseAbi([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)',
]);
const GUARD_SLOT = BigInt(keccak256(Buffer.from('guard_manager.guard.address')));
const HANDLER_SLOT = BigInt(keccak256(Buffer.from('fallback_manager.handler.address')));
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const eq = (a,b) => a?.toLowerCase() === b?.toLowerCase();
const slotAddress = word => `0x${word.slice(-40)}`;

// Inject an externally managed signer/transport; no private-key loading here.
export class RpcIO {
  constructor({client,sender,send,onMetric = () => {}}) { this.client=client;this.sender=sender;this.broadcast=send;this.onMetric=onMetric; }
  async snapshot(manifest,token) {
    const chainId = await this.client.getChainId();
    if (chainId !== 1874) throw new Error('WRONG_CHAIN');
    const block = await this.client.getBlockNumber({cacheTime:0});
    const read = (address,functionName,args=[]) => this.client.readContract({address,abi:readAbi,functionName,args,blockNumber:block});
    const slot = async n => slotAddress(await read(manifest.safe,'getStorageAt',[n,1n]));
    const owners = await read(manifest.safe,'getOwners');
    const modules = await read(manifest.safe,'getModulesPaginated',['0x0000000000000000000000000000000000000001',1n]);
    const implementation = slotAddress(await this.client.getStorageAt({address:token.address,slot:IMPLEMENTATION_SLOT,blockNumber:block}));
    let fingerprintsVerified = true;
    for (const [address,expected] of [[manifest.safe,manifest.safeCodeHash],[manifest.guard,manifest.guardCodeHash],
      [manifest.registry,manifest.registryCodeHash],[manifest.singleton,manifest.singletonCodeHash],
      [token.address,token.codeHash],[implementation,token.implementationCodeHash]]) {
      const code = await this.client.getCode({address,blockNumber:block});
      fingerprintsVerified &&= Boolean(expected && code && code !== '0x' && eq(keccak256(code),expected));
    }
    fingerprintsVerified &&= eq(implementation,token.implementation) && eq(await read(token.address,'DOMAIN_SEPARATOR'),hashDomain({domain:token.domain,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}})) &&
      Number(await read(token.address,'decimals')) === token.decimals && eq(await read(manifest.guard,'safe'),manifest.safe) &&
      eq(modules[1],'0x0000000000000000000000000000000000000001');
    return {chainId,owners,threshold:Number(await read(manifest.safe,'getThreshold')),
      guard:await slot(GUARD_SLOT),handler:await slot(HANDLER_SLOT),singleton:await slot(0n),
      registry:await read(manifest.guard,'registry'),ventureId:await read(manifest.guard,'ventureId'),
      modules:modules[0],seats:await Promise.all(owners.map(owner=>read(manifest.registry,'isSeat',[manifest.ventureId,owner]))),
      attester:await read(manifest.registry,'attester'),nonce:await read(manifest.safe,'nonce'),fingerprintsVerified,blockNumber:block};
  }
  gasPrice() { return this.client.getGasPrice(); }
  estimate(call) { return this.client.estimateGas(call); }
  balance() { return this.client.getBalance({address:this.sender}); }
  async simulate(call) {
    const result = await this.client.call(call);
    // Both allowed methods are exact: token funding returns nothing; Safe execution must return true.
    if (call.data.slice(0,10) === '0x6a761202') return decodeFunctionResult({abi:safeAbi,functionName:'execTransaction',data:result.data}) === true;
    return result.data === undefined || result.data === '0x';
  }
  async send(call) {
    try { return await this.broadcast(call); }
    finally { try { this.onMetric('relay_submission_attempt'); } catch {} }
  }
  async confirm(item,manifest,token) {
    const receipt = await this.client.waitForTransactionReceipt({hash:item.hash,confirmations:2,timeout:30000});
    const tx = await this.client.getTransaction({hash:item.hash});
    if (!eq(tx.from,this.sender) || !eq(tx.to,item.kind === 'fund' ? token.address : manifest.safe)) throw new Error('RECEIPT_TARGET_MISMATCH');
    if (receipt.status !== 'success') return {verified:false,failed:true};
    const logs = parseEventLogs({abi:events,logs:receipt.logs,strict:true});
    const transferred = logs.some(log=>log.eventName === 'Transfer' && eq(log.address,token.address) &&
      eq(log.args.from,item.from) && eq(log.args.to,item.to) && log.args.value === BigInt(item.amount));
    const executed = item.kind === 'fund' || logs.some(log=>log.eventName === 'ExecutionSuccess' &&
      eq(log.address,manifest.safe) && eq(log.args.txHash,item.safeTxHash));
    if (!transferred || !executed) throw new Error('EXPECTED_TRANSFER_NOT_CONFIRMED');
    // Independent block-pinned token read; no current balance threshold (later spends may exist).
    const recipientBalance = await this.client.readContract({address:token.address,abi:readAbi,
      functionName:'balanceOf',args:[item.to],blockNumber:receipt.blockNumber});
    return {verified:true,blockNumber:receipt.blockNumber,recipientBalance};
  }
}
