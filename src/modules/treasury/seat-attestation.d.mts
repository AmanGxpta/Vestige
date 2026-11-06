export interface SeatAttestationPort {
 attestSeat(input:{ventureId:`0x${string}`;wallet:`0x${string}`;nullifierHash:`0x${string}`}):Promise<{txHash:`0x${string}`;chainId:1874}>;
 confirm(input:{ventureId:`0x${string}`;wallet:`0x${string}`;txHash:`0x${string}`}):Promise<{state:'PENDING'}|{state:'CONFIRMED';chainId:1874;blockNumber:bigint;confirmedAt:number}|{state:'FAILED';reason:string}>;
}
export class SeatAttester implements SeatAttestationPort {
 constructor(config:Record<string,unknown>);
 attestSeat:SeatAttestationPort['attestSeat'];confirm:SeatAttestationPort['confirm'];
}
