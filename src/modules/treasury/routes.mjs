import {getTreasuryRuntime} from './runtime.mjs';
import {createTreasuryHandlers} from './http.mjs';
export async function dispatchTreasuryRequest(request,action,params){
 if(request.method!=='GET'&&!/^Bearer [A-Za-z0-9_-]{20,128}$/.test(request.headers.get('authorization')||''))return new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'UNAUTHENTICATED'}}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
 try{return await createTreasuryHandlers(await getTreasuryRuntime(),{authURI:process.env.VESTIGE_AUTH_URI}).handle(request,action,params);}
 catch{return new Response(JSON.stringify({error:{code:'TREASURY_UNCONFIGURED',message:'Treasury configuration is incomplete.'}}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
}
