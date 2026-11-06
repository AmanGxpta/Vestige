// Read-only: never signs, sends a transaction, or requests a secret.
import Safe from '@safe-global/protocol-kit';
import { getSafeL2SingletonDeployment, getProxyFactoryDeployment } from '@safe-global/safe-deployments';
import { createPublicClient, http, parseAbi, keccak256, encodeAbiParameters, zeroAddress } from 'viem';

const rpc = process.env.WHITECHAIN_RPC_URL || 'https://rpc.testnet.whitechain.io';
const client = createPublicClient({ transport: http(rpc) });
const chainId = await client.getChainId();
if (chainId !== 1874) throw new Error('Wrong chain');
const addresses = {
  safeSingletonAddress: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
  safeProxyFactoryAddress: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
};
const token = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
const block = await client.getBlock();
const result = { chainId, blockNumber: String(block.number), blockHash: block.hash, contracts: {} };
for (const [name, address] of Object.entries({ ...addresses, token })) {
  const code = await client.getCode({ address, blockNumber: block.number });
  if (!code || code === '0x') throw new Error(`No bytecode: ${name}`);
  result.contracts[name] = { address, bytes: (code.length - 2) / 2, codeHash: keccak256(code) };
}
const officialSafe = getSafeL2SingletonDeployment({version:'1.4.1'});
const officialFactory = getProxyFactoryDeployment({version:'1.4.1'});
for (const [name, deployment] of [['safeSingletonAddress',officialSafe],['safeProxyFactoryAddress',officialFactory]]) {
  const canonical = deployment.deployments.canonical;
  if (canonical.address.toLowerCase() !== addresses[name].toLowerCase() || canonical.codeHash !== result.contracts[name].codeHash) throw new Error('NONCANONICAL_SAFE_BYTECODE');
}
result.officialDeployments = { packageVersion:'1.37.67', canonicalCodeHashesMatch:true,
  chain1874Listed:Boolean(officialSafe.networkAddresses['1874'] && officialFactory.networkAddresses['1874']) };
const read = (address, declaration, functionName) => client.readContract({ address,
  abi: parseAbi([declaration]), functionName, blockNumber: block.number });
result.safeVersion = await read(addresses.safeSingletonAddress, 'function VERSION() view returns (string)', 'VERSION');
result.token = {};
for (const [name, type] of [['name', 'string'], ['symbol', 'string'], ['decimals', 'uint8'], ['DOMAIN_SEPARATOR', 'bytes32']]) {
  result.token[name] = await read(token, `function ${name}() view returns (${type})`, name);
}
for (const version of ['1', '2']) {
  const separator = keccak256(encodeAbiParameters(
    [{type:'bytes32'}, {type:'bytes32'}, {type:'bytes32'}, {type:'uint256'}, {type:'address'}],
    [keccak256(Buffer.from('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
     keccak256(Buffer.from(result.token.name)), keccak256(Buffer.from(version)), 1874n, token]));
  if (separator === result.token.DOMAIN_SEPARATOR) result.token.domainVersion = version;
}
if (!result.token.domainVersion) throw new Error('Unidentified token domain');
const sdk = await Safe.init({ provider: rpc, isL1SafeSingleton: false,
  contractNetworks: { '1874': addresses }, predictedSafe: {
    safeAccountConfig: { owners: ['0x0000000000000000000000000000000000000011',
      '0x0000000000000000000000000000000000000022'], threshold: 2, fallbackHandler: zeroAddress },
    safeDeploymentConfig: { safeVersion: '1.4.1', saltNonce: '18740001' },
  } });
const deployment = await sdk.createSafeDeploymentTransaction();
result.sdk = { protocolKit: '8.0.11', predictedSafe: await sdk.getAddress(),
  deploymentTarget: deployment.to, selector: deployment.data.slice(0, 10) };
// eth_call executes the factory without persisting state or spending testnet gas.
const simulation = await client.call({ to: deployment.to, data: deployment.data, account: '0x0000000000000000000000000000000000000033' });
result.sdk.factoryEthCallResult = simulation.data;
result.claim = 'READ_ONLY_SIMULATION; no deployment or funding transaction broadcast';
console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
