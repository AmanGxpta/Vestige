import {treasuryReadV1,paymentCreatedV1} from './readback-payload.mjs';
import {TreasuryChainReadPort} from './readback-port.mjs';
import {createPublicClient,http} from 'viem';
import {TreasuryStore} from './store.mjs';
import {c1SessionAuthentication} from './auth-port.mjs';
import {SeatAttester} from './seat-attestation.mjs';
import {loadManifest,adaptDeploymentManifest} from './manifest.mjs';
import {verifyManifestProvenance} from './provenance.mjs';
import {TreasuryService} from './service.mjs';
import {registerTreasuryRuntime} from './runtime.mjs';
import {RpcIO} from '../relayer/rpc-io.mjs';
import {createReviewedRelayer} from '../relayer/configured.mjs';
import {readFile} from 'node:fs/promises';
import {attesterSignerFromEnv} from './attester-signer.mjs';
/**
 * Root composition. Relay stays disabled (no relayer signer, authorizeSend:false).
 * The ONLY broadcast grant is the H-approved attester transport: SeatRegistry.attestSeat
 * from VESTIGE_ATTESTER_PRIVATE_KEY (server-only, never logged). Unset key => attestation disabled.
 * CR-X-002 v1 readback is the default (C2 ACKed); readbackVersion:0 keeps the legacy shape.
 */
export function createRootComposition({identityModule,env,client,readbackVersion=1}){
 let ready;
 return {ready(){return ready ||= (async()=>{
  if(!env.VESTIGE_DB_PATH||!env.VESTIGE_AUTH_URI||!env.WHITECHAIN_RPC_URL)throw new Error('ROOT_CONFIG_REQUIRED');
  let port;
  // Register BEFORE getIdentityServices. C1's registration resets its singleton.
  // Never reset it after capturing its DB/auth/services.
  identityModule.registerSeatAttester({
   attestSeat(input){if(!port)throw new Error('ATTESTER_UNCONFIGURED');return port.attestSeat(input);},
   confirm(input){return port?port.confirm(input):Promise.resolve({state:'FAILED',reason:'ATTESTER_UNCONFIGURED'});}
  });
  const identity=identityModule.getIdentityServices(env); // Runs actual C1 010_* migrations.
  const store=new TreasuryStore(identity.db);store.migrate(); // X-owned 020_* only.
  let artifact,manifests=[],flat=[],token;
  if(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH){
   const preview=JSON.parse(await readFile(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH,'utf8'));
   artifact=await loadManifest(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH,{infrastructure:preview.kind==='infrastructure'});
   if(artifact.kind!=='infrastructure'){const adapted=adaptDeploymentManifest(artifact);manifests=[artifact];flat=[adapted.manifest];token=adapted.token;}
  }
  const publicClient=client||createPublicClient({transport:http(env.WHITECHAIN_RPC_URL)});
  const relay=createReviewedRelayer({env,io:new RpcIO({client:publicClient}),manifests:flat,token,authorizeSend:()=>false});
  const registry=artifact?.contracts.registry;let signer=null,attesterMode='DISABLED';
  try{signer=attesterSignerFromEnv(env,{client:publicClient,registry,expectedAddress:env.ATTESTER_ADDRESS});if(signer)attesterMode='ENABLED';}
  catch(e){attesterMode=/^ATTESTER_[A-Z_]+$/.test(e?.message||'')?e.message:'ATTESTER_KEY_INVALID';} // Attestation-only failure; reads stay up.
  port=new SeatAttester({store,client:publicClient,registry,attester:signer?.address,send:signer?.send,authorizeSend:async()=>signer!==null});
  const readConfirmedSeats=async(ventureId,wallets)=>{
   if(!artifact)return false;
   await verifyManifestProvenance(publicClient,artifact);
   for(const wallet of wallets){const r=store.db.get('SELECT tx_hash FROM treasury_attestations WHERE venture_id=? AND wallet=?',ventureId,wallet);
    if(!r?.tx_hash||(await port.confirm({ventureId,wallet,txHash:r.tx_hash})).state!=='CONFIRMED')return false;}
   return true;
  };
  const treasury=new TreasuryService({store,relay,manifests,readConfirmedSeats});
  treasury.authenticate=c1SessionAuthentication(identity.auth);
  if(readbackVersion===1){
   treasury.readPort=new TreasuryChainReadPort({client:publicClient,store});
   treasury.read=(id,actor)=>treasuryReadV1(treasury,id,actor);
   const mutate=treasury.mutate.bind(treasury);
   treasury.mutate=async(action,args)=>{const result=await mutate(action,args);return action==='payments'?paymentCreatedV1(result):result;};
  }
  registerTreasuryRuntime(treasury);
  // CR-ID-05 deliberately not injected. Actual C1 publicList keeps null summaries.
  return {identity,treasury,store,seatAttester:port,client:publicClient,mode:'READ_ONLY',attesterMode};
 })();}};
}
