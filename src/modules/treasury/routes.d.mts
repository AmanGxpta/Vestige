export function dispatchTreasuryRequest(request:Request,action:string,params:{id:string;pid?:string},prepare?:()=>Promise<unknown>):Promise<Response>;
