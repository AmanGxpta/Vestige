import { keccak256, encodeFunctionData, hashTypedData, parseAbi, recoverTypedDataAddress, zeroAddress } from 'viem';
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
export const fundingRelayId=(from,nonce)=>`fund:${from.toLowerCase()}:${nonce.toLowerCase()}`;
export const paymentRelayId=(safe,nonce)=>`safe:${safe.toLowerCase()}:${nonce}`;
const eq = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const requirePolicy = (ok, reason) => { if (!ok) throw new Error(reason); };
const uint = value => { requirePolicy(typeof value === 'bigint' && value >= 0n && value < 2n ** 256n, 'INVALID_UINT'); return value; };
const address = value => requirePolicy(/^0x[0-9a-fA-F]{40}$/.test(value) && !eq(value, zeroAddress), 'INVALID_ADDRESS');

// Private service seam, intentionally no HTTP/session adapter until H locks shared contracts.
export class RestrictedRelayer {
  constructor({ manifests = [], token, io, journal, limits, now = () => Math.floor(Date.now()/1000), enabled = false, safety }) {
    this.manifests = new Map(manifests.map(m => [m.ventureId.toLowerCase(), structuredClone(m)]));
    this.enabled = enabled; this.safety = safety;
    this.token = token; this.io = io; this.journal = journal; this.limits = limits; this.now = now;
  }
  async context(ventureId,session) {
    const manifest = this.manifests.get(String(ventureId).toLowerCase());
    requirePolicy(manifest, 'UNREGISTERED_TREASURY');
    try {
      const state = await this.io.snapshot(manifest, this.token);
      requirePolicy(!state.deployer || !eq(state.deployer,this.io.sender),'ROLE_SEPARATION');
      requirePolicy(state.chainId === 1874 && state.threshold === 2 && state.owners?.length === 2 &&
        !eq(state.owners[0],state.owners[1]) && state.seats?.length === 2 && state.seats.every(seat=>seat === true) &&
        state.modules?.length === 0 && eq(state.handler,zeroAddress) && state.fingerprintsVerified === true &&
        eq(state.guard,manifest.guard) && eq(state.registry,manifest.registry) && eq(state.ventureId,manifest.ventureId) &&
        eq(state.singleton,manifest.singleton), 'UNVERIFIED_TREASURY');
      requirePolicy(!state.owners.some(owner=>eq(owner,this.io.sender)) && state.attester && !eq(state.attester,this.io.sender), 'ROLE_SEPARATION');
      return { manifest, state };
    } catch(e) {
      if(this.enabled && this.safety && this.journal){
        if(session)await this.monitor(session,'manifest_or_domain_drift',{},true);
        else await this.journal.run(s=>this.monitor(s,'manifest_or_domain_drift',{},true));
      }
      throw e;
    }
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
    requirePolicy(this.enabled, 'RELAYER_DISABLED');
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
    return this.#submit(fundingRelayId(request.from,request.nonce),
      {to:this.token.address,data,value:0n}, [request.from], context, {kind:'fund',from:request.from,to:context.manifest.safe,amount:request.value.toString()});
  }
  async execute(request) {
    requirePolicy(this.enabled, 'RELAYER_DISABLED');
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
    return this.#submit(paymentRelayId(context.manifest.safe,request.nonce), {to:context.manifest.safe,data,value:0n},
      signed.map(s=>s.signer),context,{kind:'payment',from:context.manifest.safe,to:request.recipient,amount:request.amount.toString(),safeTxHash:hashTypedData(typed)});
  }
  async #submit(key, call, actors, context, evidence) {
    return this.journal.run(async session => {
      const state = session.state;
      if(state.requests[key]){await this.monitor(session,'duplicate_attempt',{},false);throw new Error('DUPLICATE_OR_PENDING');}
      requirePolicy(!Object.values(state.requests).some(r=>['RESERVED','UNKNOWN','SUBMITTED'].includes(r.status)), 'WALLET_IN_FLIGHT');
      requirePolicy(!state.halt, 'RELAYER_CIRCUIT_OPEN');
      requirePolicy(this.safety, 'FEE_POLICY_UNREVIEWED');
      try { await this.safety.ready(this.io,this.limits,this.now()*1000); }
      catch(e) { state.halt={reason:e.message,at:this.now()*1000}; await session.commit(); throw e; }
      const day = Math.floor(this.now()/86400);
      if (state.day !== day) { state.day = day; state.spent = '0'; }
      const minute = Math.floor(this.now()/60);
      if (state.minute !== minute) { state.minute = minute; state.counts = {}; }
      const rateKeys = [`venture:${context.manifest.ventureId}`, ...actors.map(a=>`wallet:${a.toLowerCase()}`)];
      for (const k of rateKeys) if((state.counts[k] || 0) >= this.limits.maxPerMinute){await this.monitor(session,'rate_limit',{},false);throw new Error('RATE_LIMITED');}
      for (const k of rateKeys) state.counts[k] = (state.counts[k] || 0) + 1;
      await session.commit(); // Verified attempts count even if simulation/quote later fails.
      const senderNonce = await this.io.senderNonce('pending');
      if (senderNonce !== await this.io.senderNonce('latest')) {
        await this.monitor(session,'nonce_lock',{},true); throw new Error('SENDER_NONCE_LOCK');
      }
      const gasPrice = await this.io.gasPrice();
      let estimate;try{estimate=await this.io.estimate({...call,account:this.io.sender});}catch{await this.monitor(session,'simulation_failure',{},false);throw new Error('SIMULATION_FAILED');}
      requirePolicy(typeof estimate==='bigint'&&estimate>0n,'INVALID_GAS_QUOTE');
      const gas = estimate * 120n / 100n + 10000n;
      let quote;try{quote=await this.io.quoteL1({...call,gas,gasPrice,nonce:senderNonce});}catch{await this.monitor(session,'fee_quote_unavailable',{},true);throw new Error('FEE_QUOTE_UNAVAILABLE');}
      requirePolicy(typeof quote.l1Fee==='bigint'&&quote.l1Fee>=0n,'INVALID_FEE_QUOTE');
      if(quote.l1Fee>this.limits.l1FeeReserveWei){await this.monitor(session,'l1_quote_exceeds_reserve',{quoteWei:quote.l1Fee},true);throw new Error('L1_FEE_RESERVE_EXCEEDED');}
      requirePolicy(this.now()*1000-quote.at >= 0 && this.now()*1000-quote.at <= 10000, 'STALE_FEE_QUOTE');
      const reserved = gas * gasPrice + this.limits.l1FeeReserveWei;
      requirePolicy(gas <= this.limits.maxGas && gasPrice > 0n && gasPrice <= this.limits.maxGasPrice, 'GAS_CAP');
      if(BigInt(state.spent)+reserved>this.limits.dailyBudgetWei){await this.monitor(session,'daily_budget_exhausted',{reservedWei:state.spent},false);throw new Error('DAILY_BUDGET');}
      if (await this.io.balance() < reserved + this.limits.minBalanceWei) {
        await this.monitor(session,'low_gas_balance',{balanceWei:await this.io.balance()},true);
        throw new Error('LOW_GAS_BALANCE');
      }
      try{requirePolicy(await this.io.simulate({...call,account:this.io.sender,gas,gasPrice}) === true, 'SIMULATION_FAILED');}catch{await this.monitor(session,'simulation_failure',{},false);throw new Error('SIMULATION_FAILED');}
      state.spent = (BigInt(state.spent) + reserved).toString();

      requirePolicy(this.now()*1000-quote.at <= 10000, 'STALE_FEE_QUOTE');
      state.requests[key] = {status:'RESERVED',reserved:reserved.toString(),...evidence,
        ventureId:context.manifest.ventureId,sender:this.io.sender,senderNonce:String(senderNonce),toTarget:call.to,
        callHash:keccak256(call.data),createdAt:this.now()*1000,day,l1Reserved:String(this.limits.l1FeeReserveWei),quote:{l1Fee:String(quote.l1Fee),blockNumber:String(quote.blockNumber),blockHash:quote.blockHash}};
      await session.commit(); // Persist BEFORE a potentially ambiguous submission.
      await this.monitor(session,'budget_reserved',{reservedWei:reserved,dailyReservedWei:state.spent},false);
      requirePolicy(!state.halt,'ALERT_TRANSPORT_FAILED');
      requirePolicy(this.now()*1000-quote.at<=10000,'STALE_FEE_QUOTE');
      requirePolicy(this.enabled,'RELAYER_DISABLED');
      await this.safety.beforeSend?.(this.now()*1000);
      try {
        state.requests[key].broadcastAttemptedAt=this.now()*1000;await session.commit();
        const hash = await this.io.send({...call,gas,gasPrice,nonce:senderNonce,account:this.io.sender});
        requirePolicy(/^0x[0-9a-fA-F]{64}$/.test(hash||''),'INVALID_SUBMISSION_HASH');
        state.requests[key] = {...state.requests[key],status:'SUBMITTED',hash};
        await session.commit();
        return {id:key,status:'SUBMITTED',hash};
      } catch (error) {
        state.requests[key].status = 'UNKNOWN';
        await this.monitor(session,'submission_unknown',{},true);
        await session.commit();
        throw new Error('SUBMISSION_UNKNOWN_NO_RETRY');
      }
    });
  }
  async confirm(id) {
    return this.journal.run(async session => {
      const item = session.state.requests[id];
      requirePolicy(item&&['SUBMITTED','EXECUTED','FAILED'].includes(item.status), 'NOT_SUBMITTED');
      if(item.status==='FAILED'&&item.failure&&item.reconciliation)return {id,status:'FAILED',error:item.failure};
      const context = await this.context(item.ventureId,session);
      let proof;try{proof=await this.io.confirm(item,context.manifest,this.token);}catch(e){if(this.now()*1000-item.createdAt>120000||/MISMATCH|REORG|NOT_CONFIRMED/.test(e.message||''))await this.monitor(session,'receipt_unknown_or_stale',{ageMs:Math.max(0,this.now()*1000-item.createdAt)},true);throw new Error('RECEIPT_UNVERIFIED');}
      requirePolicy(proof?.verified === true || proof?.failed === true, 'UNVERIFIED_RECEIPT');
      const fee=proof?.fee;
      if (fee && !item.feeReconciled) {
        const used=fee.evm+fee.l1; stateUsed(session.state,item,used); item.feeReconciled=true;
        if (used>BigInt(item.reserved)||fee.l1>BigInt(item.l1Reserved)) await this.monitor(session,'fee_reserve_exceeded',{usedWei:used,reservedWei:item.reserved},true);
        await this.monitor(session,'receipt_fee',{evmWei:fee.evm,l1Wei:fee.l1},false);
      } else if (!fee && (proof?.verified || proof?.failed)) await this.monitor(session,'fee_accounting_unavailable',{},true);
      if (proof?.failed === true) {
        await this.monitor(session,'failed_receipt',{},false);
        session.state.requests[id] = {...item,status:'FAILED',blockNumber:proof.blockNumber?String(proof.blockNumber):undefined,blockHash:proof.blockHash};
        await session.commit();
        return {id,status:'FAILED',hash:item.hash};
      }
      requirePolicy(proof?.verified === true, 'UNVERIFIED_RECEIPT');
      await this.monitor(session,'confirmation_latency',{latencyMs:Math.max(0,this.now()*1000-item.createdAt)},false);
      session.state.requests[id] = {...item,status:'EXECUTED',blockNumber:String(proof.blockNumber),blockHash:proof.blockHash};
      await session.commit();
      return {id,status:'EXECUTED',hash:item.hash,blockNumber:String(proof.blockNumber),blockHash:proof.blockHash};
    });
  }
  async monitor(session,event,metrics,halt) {
    if(halt)session.state.halt={reason:event,at:this.now()*1000};
    try { await this.safety.notify(event,metrics); }
    catch {session.state.halt={reason:'ALERT_TRANSPORT_FAILED',at:this.now()*1000};}
    await session.commit();
  }
  /** Operator-only recovery seam; no HTTP route, no signing and never an automatic resend. */
  async reconcileNonce({id,txHash,review,abandonUnsent=false}) {
    requirePolicy(review?.approved === true && review.reference, 'OPERATOR_REVIEW_REQUIRED');
    return this.journal.run(async session=>{
      const item=session.state.requests[id];
      requirePolicy(item&&['RESERVED','UNKNOWN','SUBMITTED'].includes(item.status)&&item.senderNonce!==undefined,'NO_RECONCILABLE_NONCE');
      if(abandonUnsent){
        requirePolicy(item.status==='RESERVED'&&!item.broadcastAttemptedAt,'BROADCAST_MAY_HAVE_OCCURRED');
        requirePolicy(String(await this.io.senderNonce('pending'))===item.senderNonce&&String(await this.io.senderNonce('latest'))===item.senderNonce,'NONCE_UNRESOLVED_NO_RETRY');
        item.status='FAILED';item.reconciliation=review.reference;item.failure='UNSENT_RESERVATION_ABANDONED';await session.commit();return {id,status:'FAILED'};
      }
      const observed=await this.io.inspectNonce(item,txHash);
      if(observed.match){item.hash=txHash;item.status='SUBMITTED';item.reconciliation=review.reference;}
      else if(observed.consumed){item.status='FAILED';item.failure='NONCE_CONSUMED_BY_DIFFERENT_CALL';item.reconciliation=review.reference;await this.monitor(session,'nonce_consumed_by_different_call',{},true);}
      else throw new Error('NONCE_UNRESOLVED_NO_RETRY');
      await session.commit();return {id,status:item.status,hash:item.hash};
    });
  }
  async clearCircuit({approved,reference}) {
    requirePolicy(approved === true && reference,'OPERATOR_REVIEW_REQUIRED');
    await this.safety.ready(this.io,this.limits,this.now()*1000);
    for(const m of this.manifests.values()) await this.context(m.ventureId);
    return this.journal.run(async session=>{
      requirePolicy(!Object.values(session.state.requests).some(r=>['RESERVED','UNKNOWN','SUBMITTED'].includes(r.status)),'WALLET_IN_FLIGHT');
      session.state.recovery={reference,at:this.now()*1000};session.state.halt=null;await session.commit();
    });
  }

}

function stateUsed(state,item,used){
 state.usedByDay ||= {}; const day=String(item.day);state.usedByDay[day]=(BigInt(state.usedByDay[day]||'0')+used).toString();
 item.usedWei=String(used);if(state.day===item.day&&used>BigInt(item.reserved))state.spent=(BigInt(state.spent)+used-BigInt(item.reserved)).toString();
}
