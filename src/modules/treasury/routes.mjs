import {getTreasuryRuntime} from './runtime.mjs';
import {createTreasuryHandlers} from './http.mjs';
const unconfigured=()=>new Response(JSON.stringify({error:{code:'TREASURY_UNCONFIGURED',message:'Treasury configuration is incomplete.'}}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
/**
 * `prepare` is an optional root-readiness hook (for example H's shared `services()`).
 * It runs after the bearer-format pre-check and inside the fail-closed boundary, so a
 * composition/config failure is the stable 503 and never an uncaught framework 500.
 */
export async function dispatchTreasuryRequest(request,action,params,prepare){
 if(request.method!=='GET'&&!/^Bearer [A-Za-z0-9_-]{20,128}$/.test(request.headers.get('authorization')||''))return new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'UNAUTHENTICATED'}}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
 try{if(prepare)await prepare();return await createTreasuryHandlers(await getTreasuryRuntime(),{authURI:process.env.VESTIGE_AUTH_URI}).handle(request,action,params);}
 catch{return unconfigured();}
}
