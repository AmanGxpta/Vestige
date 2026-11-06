export type SqlValue=string|number|bigint|null;
export interface SqlDb {run(sql:string,...args:SqlValue[]):{changes:number};get<T=Record<string,SqlValue>>(sql:string,...args:SqlValue[]):T|undefined;all<T=Record<string,SqlValue>>(sql:string,...args:SqlValue[]):T[];tx<T>(fn:()=>T):T;raw?:{exec(sql:string):void;close():void}}
export class TreasuryError extends Error {code:string;status:number;constructor(code:string,status?:number)}
export function fail(code:string,status?:number):never;
export class TreasuryStore {constructor(db:SqlDb);db:SqlDb;migrate():void;authenticate(request:Request,now?:number):string;seats(ventureId:string):{wallet:string;world_status:string;onchain_status:string;environment:string;protocol_version:string}[];member(ventureId:string,wallet:string):void;source(ventureId:string):'WORLD_PRODUCTION'|'TESTED_IN_SIMULATOR'|'UNKNOWN';operations(ventureId:string,actor?:string):Record<string,unknown>[]}
export function openTreasuryStore(path:string):TreasuryStore;
