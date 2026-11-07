import {TreasuryError} from './store.mjs';
/** Reuse C1's actual session verifier; never mint a second session/token namespace. */
export function c1SessionAuthentication(auth){
 if(typeof auth?.authenticate!=='function')throw new Error('C1_AUTH_REQUIRED');
 return request=>{
  try{return auth.authenticate(request).toLowerCase();}
  catch(e){if(e?.code==='UNAUTHENTICATED')throw new TreasuryError('UNAUTHENTICATED',401);throw e;}
 };
}
