export interface TreasurySummary {
 treasuryActive:boolean|null;funded:boolean|null;observedAt:string;source:string;
 verificationStatus:'UNKNOWN'|'PENDING'|'ACTIVE'|'UNVERIFIED'|'FAILED';
}
export class TreasurySummaryPort {
 constructor(input:{service:{manifests:{ventureId:string;contracts:{safe:{address:`0x${string}`};token:{address:`0x${string}`}}}[];context(id:string):Promise<{state:{blockNumber:bigint;blockHash:`0x${string}`}}>;
 store:{source(id:string):string}};client:unknown;now?:()=>number});
 summary(ventureId:`0x${string}`):Promise<TreasurySummary>;
}
