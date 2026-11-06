import {readFile} from 'node:fs/promises';
import {SeatAttester} from './seat-attestation.mjs';
import {verifyManifestProvenance} from './provenance.mjs';
import {createPublicClient,http} from 'viem';
import {openTreasuryStore} from './store.mjs';
import {loadManifest,adaptDeploymentManifest} from './manifest.mjs';
import {TreasuryService} from './service.mjs';
import {createReviewedRelayer} from '../relayer/configured.mjs';
import {RpcIO} from '../relayer/rpc-io.mjs';
let configured=null;
/** H composes secure transports and reviewed policy here; C1 registers the seat port separately. */
export function registerTreasuryRuntime(service){configured=service;}
export async function getTreasuryRuntime(env=process.env){
 if(configured)return configured;
 if(!env.VESTIGE_DB_PATH||!env.VESTIGE_AUTH_URI||!env.WHITECHAIN_RPC_URL)throw new Error('TREASURY_UNCONFIGURED');
 const store=openTreasuryStore(env.VESTIGE_DB_PATH);let manifests=[],flat=[],token,loaded;
 if(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH){
  const preview=JSON.parse(await readFile(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH,'utf8'));
  loaded=await loadManifest(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH,{infrastructure:preview.kind==='infrastructure'});
  if(loaded.kind!=='infrastructure'){const a=adaptDeploymentManifest(loaded);manifests=[loaded];flat=[a.manifest];token=a.token;}
 }
 const client=createPublicClient({transport:http(env.WHITECHAIN_RPC_URL)});
 // No secret loader and no live signer. RELAYER_ENABLED alone cannot authorize a send.
 const relay=createReviewedRelayer({env,manifests:flat,token,io:new RpcIO({client}),authorizeSend:()=>false});
 const seatAttester=new SeatAttester({store,client,registry:loaded?.contracts.registry});
 const readConfirmedSeats=async(id,wallets)=>{
  if(!loaded)return false;await verifyManifestProvenance(client,loaded);
  for(const wallet of wallets){const row=store.db.get('SELECT tx_hash FROM treasury_attestations WHERE venture_id=? AND wallet=?',id,wallet);
   if(!row?.tx_hash||(await seatAttester.confirm({ventureId:id,wallet,txHash:row.tx_hash})).state!=='CONFIRMED')return false;}
  return true;
 };
 configured=new TreasuryService({store,relay,manifests,readConfirmedSeats});configured.seatAttester=seatAttester;return configured;
}
