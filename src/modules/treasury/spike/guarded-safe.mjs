import Safe from '@safe-global/protocol-kit';
import { encodeFunctionData, parseAbi, zeroAddress, isAddress } from 'viem';

// Read-only transaction construction. Registry/helper addresses must come from H's reviewed manifest.
export async function buildGuardedSafe({provider,helper,registry,ventureId,owners,saltNonce}) {
  if (owners?.length !== 2 || owners.some(o=>!isAddress(o)) || owners[0].toLowerCase() === owners[1].toLowerCase()) throw new Error('TWO_DISTINCT_OWNERS');
  if (!isAddress(helper) || !isAddress(registry) || !/^0x[0-9a-fA-F]{64}$/.test(ventureId)) throw new Error('INVALID_BINDING');
  const sdk = await Safe.init({provider,isL1SafeSingleton:false,contractNetworks:{'1874':{
    safeSingletonAddress:'0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
    safeProxyFactoryAddress:'0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
  }},predictedSafe:{safeAccountConfig:{owners,threshold:2,to:helper,
    data:encodeFunctionData({abi:parseAbi(['function install(address registry,bytes32 ventureId)']),functionName:'install',args:[registry,ventureId]}),
    fallbackHandler:zeroAddress,paymentToken:zeroAddress,payment:0,paymentReceiver:zeroAddress},
    safeDeploymentConfig:{safeVersion:'1.4.1',saltNonce}}});
  if (await sdk.getSafeProvider().getChainId() !== 1874n) throw new Error('WRONG_CHAIN');
  return {address:await sdk.getAddress(),transaction:await sdk.createSafeDeploymentTransaction()};
}
