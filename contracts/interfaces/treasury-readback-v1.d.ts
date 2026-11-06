/** CR-X-002 / refinement of CR-C2-009. PROPOSED: not active until H accepts. */
type Address=`0x${string}`;
type Hex=`0x${string}`;
type UIntString=string;
type ReadStatus='UNKNOWN'|'PENDING'|'VERIFIED'|'FAILED';
type TreasuryStatus='UNKNOWN'|'PENDING'|'ACTIVE'|'UNVERIFIED'|'FAILED';
type RelayStatus='RESERVED'|'UNKNOWN'|'SUBMITTED'|'EXECUTED'|'FAILED';
export interface SafeTypedDataV1 {
 domain:{chainId:1874;verifyingContract:Address};
 types:{SafeTx:{name:string;type:string}[]};primaryType:'SafeTx';
 message:{to:Address;value:UIntString;data:Hex;operation:0;safeTxGas:UIntString;baseGas:UIntString;gasPrice:UIntString;gasToken:Address;refundReceiver:Address;nonce:UIntString};
}
export interface PaymentReadV1 {
 paymentId:string;ventureId:Hex;safeTxHash:Hex;recipient:Address;tokenAddress:Address;amountRaw:UIntString;
 reason:string;signerWallets:Address[];status:'AWAITING_APPROVALS'|'READY'|'EXECUTED'|'FAILED';safeNonce:UIntString;
 /** Present only for a fresh, signable proposal and authorized current founders. */
 safeTypedData:SafeTypedDataV1|null;
 relay:{operationId:string;status:RelayStatus;txHash?:Hex;error?:string}|null;
 executedTxHash:Hex|null;
}
export interface TreasuryReadV1 {
 schemaVersion:1;ventureId:Hex;verificationStatus:TreasuryStatus;
 treasury:null|{ventureId:Hex;safeAddress:Address;chainId:1874;ownerAddresses:Address[];threshold:2;guardAddress:Address;registryAddress:Address;verificationStatus:'ACTIVE';deploymentTxHash:Hex;deploymentBlock:UIntString};
 balanceRaw:UIntString|null;tokenDecimals:6|null;
 depositsStatus:ReadStatus;
 deposits:{from:Address;amountRaw:UIntString;txHash:Hex;status:'VERIFIED';blockNumber:UIntString;blockHash:Hex;logIndex:number;confirmedAt:string}[];
 /** Empty for unauthenticated/non-founder viewers. No signatures returned. */
 payments:PaymentReadV1[];
 evidence:{id:string;ventureId:Hex;kind:'REJECTED_ATTEMPT';label:'CHAIN_VERIFIED';status:'VERIFIED';chainId:1874;txHash:Hex;blockNumber:UIntString;blockHash:Hex;confirmedAt:string;source:'WHITECHAIN_RPC';revertReason:'GS020';reasonSource:'MINED_TRACE'}[];
 manifest:unknown|null;
 provenance:null|{chainId:1874;blockNumber:UIntString;blockHash:Hex;observedAt:string;source:'WORLD_PRODUCTION'|'TESTED_IN_SIMULATOR'|'UNKNOWN'};
 /** Existing v0 operation result shape; owner/actor visibility is unchanged. */
 operations:{operationId:string;status:RelayStatus;txHash?:Hex;blockNumber?:UIntString;blockHash?:Hex;source:string;error?:string}[];
 source:'API';
}
export interface PaymentCreatedV1 {
 operationId:string;paymentId:string;ventureId:Hex;safeTxHash:Hex;safeNonce:UIntString;
 safeTypedData:SafeTypedDataV1;signerWallets:[];status:'AWAITING_APPROVALS';
}
