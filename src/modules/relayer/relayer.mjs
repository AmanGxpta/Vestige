import { encodeFunctionData, hashTypedData, parseAbi, recoverTypedDataAddress, zeroAddress } from 'viem';
if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
export const tokenAbi = parseAbi([
  'function transfer(address to,uint256 amount) returns (bool)',
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)',
]);
export const safeAbi = parseAbi(['function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns (bool)']);
export const fundingTypes = { TransferWithAuthorization: [
  {name:'from',type:'address'}, {name:'to',type:'address'}, {name:'value',type:'uint256'},
  {name:'validAfter',type:'uint256'}, {name:'validBefore',type:'uint256'}, {name:'nonce',type:'bytes32'},
] };
export const safeTypes = { SafeTx: [
  {name:'to',type:'address'}, {name:'value',type:'uint256'}, {name:'data',type:'bytes'},
  {name:'operation',type:'uint8'}, {name:'safeTxGas',type:'uint256'}, {name:'baseGas',type:'uint256'},
  {name:'gasPrice',type:'uint256'}, {name:'gasToken',type:'address'}, {name:'refundReceiver',type:'address'}, {name:'nonce',type:'uint256'},
] };
const eq = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const requirePolicy = (ok, reason) => { if (!ok) throw new Error(reason); };
const uint = value => { requirePolicy(typeof value === 'bigint' && value >= 0n && value < 2n ** 256n, 'INVALID_UINT'); return value; };
const address = value => requirePolicy(/^0x[0-9a-fA-F]{40}$/.test(value) && !eq(value, zeroAddress), 'INVALID_ADDRESS');

// Private service seam, intentionally no HTTP/session adapter until H locks shared contracts.
export class RestrictedRelayer {
  constructor({ manifests = [], token, io, journal, limits, now = () => Math.floor(Date.now()/1000) }) {
    this.manifests = new Map(manifests.map(m => [m.ventureId.toLowerCase(), structuredClone(m)]));
    this.token = token; this.io = io; this.journal = journal; this.limits = limits; this.now = now;
  }
  async context(ventureId) {
    const manifest = this.manifests.get(String(ventureId).toLowerCase());
    requirePolicy(manifest, 'UNREGISTERED_TREASURY');
    const state = await this.io.snapshot(manifest, this.token);
    requirePolicy(state.chainId === 1874 && state.threshold === 2 && state.owners?.length === 2 &&
      !eq(state.owners[0],state.owners[1]) && state.seats?.length === 2 && state.seats.every(seat=>seat === true) &&
      state.modules?.length === 0 && eq(state.handler,zeroAddress) && state.fingerprintsVerified === true &&
      eq(state.guard,manifest.guard) && eq(state.registry,manifest.registry) && eq(state.ventureId,manifest.ventureId) &&
      eq(state.singleton,manifest.singleton), 'UNVERIFIED_TREASURY');
    requirePolicy(!state.owners.some(owner=>eq(owner,this.io.sender)) && state.attester && !eq(state.attester,this.io.sender), 'ROLE_SEPARATION');
    return { manifest, state };
  }
  fundingTyped(request, manifest) {
    return { domain: this.token.domain, types: fundingTypes, primaryType: 'TransferWithAuthorization',
      message: { from:request.from, to:manifest.safe, value:request.value, validAfter:request.validAfter,
        validBefore:request.validBefore, nonce:request.nonce } };
  }
  paymentTyped(request, manifest) {
    return { domain: {chainId:1874, verifyingContract:manifest.safe}, types:safeTypes, primaryType:'SafeTx',
      message: {to:this.token.address, value:0n, data:encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[request.recipient,request.amount]}),
        operation:0, safeTxGas:0n, baseGas:0n, gasPrice:0n, gasToken:zeroAddress, refundReceiver:zeroAddress, nonce:request.nonce} };
  }
  async fund(request) {
    const context = await this.context(request.ventureId);
    address(request.from);
    requirePolicy(eq(request.to,context.manifest.safe), 'RECIPIENT_NOT_SAFE');
    requirePolicy(uint(request.value) > 0n && uint(request.validAfter) < BigInt(this.now()) && uint(request.validBefore) > BigInt(this.now()), 'INVALID_AUTHORIZATION_WINDOW');
    requirePolicy(/^0x[0-9a-fA-F]{64}$/.test(request.nonce), 'INVALID_NONCE');
    requirePolicy(this.token.domain.chainId === 1874 && eq(this.token.domain.verifyingContract,this.token.address), 'WRONG_DOMAIN');
    const typed = this.fundingTyped(request, context.manifest);
    requirePolicy(/^0x[0-9a-fA-F]{130}$/.test(request.signature), 'EOA_SIGNATURE_REQUIRED');
    requirePolicy(eq(await recoverTypedDataAddress({...typed,signature:request.signature}),request.from), 'INVALID_PAYER_SIGNATURE');
    const data = encodeFunctionData({abi:tokenAbi, functionName:'transferWithAuthorization',
      args:[request.from,context.manifest.safe,request.value,request.validAfter,request.validBefore,request.nonce,request.signature]});
    return this.#submit(`fund:${request.from.toLowerCase()}:${request.nonce.toLowerCase()}`,
      {to:this.token.address,data,value:0n}, [request.from], context, {kind:'fund',from:request.from,to:context.manifest.safe,amount:request.value.toString()});
  }
  async execute(request) {
    const context = await this.context(request.ventureId);
    address(request.recipient); requirePolicy(uint(request.amount) > 0n, 'ZERO_PAYMENT');
    requirePolicy(uint(request.nonce) === context.state.nonce, 'STALE_SAFE_NONCE');
    requirePolicy(Array.isArray(request.signatures) && request.signatures.length === 2, 'TWO_SIGNATURES_REQUIRED');
    const typed = this.paymentTyped(request,context.manifest);
    const signed = await Promise.all(request.signatures.map(async signature => {
      requirePolicy(/^0x[0-9a-fA-F]{130}$/.test(signature), 'EOA_SIGNATURE_REQUIRED');
      return {signature,signer:await recoverTypedDataAddress({...typed,signature})};
    }));
    requirePolicy(!eq(signed[0].signer,signed[1].signer) && signed.every(s=>context.state.owners.some(o=>eq(o,s.signer))), 'INVALID_SAFE_SIGNERS');
    signed.sort((a,b)=>BigInt(a.signer)<BigInt(b.signer)?-1:1);
    const packed = `0x${signed.map(s=>s.signature.slice(2)).join('')}`;
    const m = typed.message;
    const data = encodeFunctionData({abi:safeAbi,functionName:'execTransaction',args:[m.to,m.value,m.data,m.operation,m.safeTxGas,m.baseGas,m.gasPrice,m.gasToken,m.refundReceiver,packed]});
    return this.#submit(`safe:${context.manifest.safe.toLowerCase()}:${request.nonce}`, {to:context.manifest.safe,data,value:0n},
      signed.map(s=>s.signer),context,{kind:'payment',from:context.manifest.safe,to:request.recipient,amount:request.amount.toString(),safeTxHash:hashTypedData(typed)});
  }
  async #submit(key, call, actors, context, evidence) {
    return this.journal.run(async session => {
      const state = session.state;
      requirePolicy(!state.requests[key], 'DUPLICATE_OR_PENDING');
      requirePolicy(!Object.values(state.requests).some(r=>['RESERVED','UNKNOWN','SUBMITTED'].includes(r.status)), 'WALLET_IN_FLIGHT');
      const day = Math.floor(this.now()/86400);
      if (state.day !== day) { state.day = day; state.spent = '0'; }
      const minute = Math.floor(this.now()/60);
      if (state.minute !== minute) { state.minute = minute; state.counts = {}; }
      const rateKeys = [`venture:${context.manifest.ventureId}`, ...actors.map(a=>`wallet:${a.toLowerCase()}`)];
      for (const k of rateKeys) requirePolicy((state.counts[k] || 0) < this.limits.maxPerMinute, 'RATE_LIMITED');
      const gasPrice = await this.io.gasPrice();
      const estimate = await this.io.estimate({...call,account:this.io.sender});
      const gas = estimate * 120n / 100n + 10000n;
      const reserved = gas * gasPrice + this.limits.l1FeeReserveWei;
      requirePolicy(gas <= this.limits.maxGas && gasPrice > 0n && gasPrice <= this.limits.maxGasPrice, 'GAS_CAP');
      requirePolicy(BigInt(state.spent) + reserved <= this.limits.dailyBudgetWei, 'DAILY_BUDGET');
      if (await this.io.balance() < reserved + this.limits.minBalanceWei) {
        try { this.io.onMetric?.('low_gas_balance'); } catch {}
        throw new Error('LOW_GAS_BALANCE');
      }
      requirePolicy(await this.io.simulate({...call,account:this.io.sender,gas,gasPrice}) === true, 'SIMULATION_FAILED');
      state.spent = (BigInt(state.spent) + reserved).toString();
      for (const k of rateKeys) state.counts[k] = (state.counts[k] || 0) + 1;
      state.requests[key] = {status:'RESERVED',reserved:reserved.toString(),...evidence,ventureId:context.manifest.ventureId};
      await session.commit(); // Persist BEFORE a potentially ambiguous submission.
      try {
        const hash = await this.io.send({...call,gas,gasPrice,account:this.io.sender});
        state.requests[key] = {...state.requests[key],status:'SUBMITTED',hash};
        await session.commit();
        return {id:key,status:'SUBMITTED',hash};
      } catch (error) {
        state.requests[key].status = 'UNKNOWN';
        await session.commit();
        throw new Error('SUBMISSION_UNKNOWN_NO_RETRY');
      }
    });
  }
  async confirm(id) {
    return this.journal.run(async session => {
      const item = session.state.requests[id];
      requirePolicy(item?.status === 'SUBMITTED', 'NOT_SUBMITTED');
      const context = await this.context(item.ventureId);
      const proof = await this.io.confirm(item, context.manifest, this.token);
      if (proof?.failed === true) {
        session.state.requests[id] = {...item,status:'FAILED'};
        await session.commit();
        return {id,status:'FAILED',hash:item.hash};
      }
      requirePolicy(proof?.verified === true, 'UNVERIFIED_RECEIPT');
      session.state.requests[id] = {...item,status:'EXECUTED',blockNumber:String(proof.blockNumber)};
      await session.commit();
      return {id,status:'EXECUTED',hash:item.hash,blockNumber:String(proof.blockNumber)};
    });
  }
}
