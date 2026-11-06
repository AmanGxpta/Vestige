import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {anchors} from './manifest.mjs';
export const operators=Object.freeze({deployer:'0x10d8C1d6359F0694203924182d3da83843a4e052',attester:'0x84068C51A9236A869E5F05FBA96323E97597DDEd',relayer:'0xc57f2f78997e35fc2C1E0BA06249B499cD293116',registrar:'0xc63F0594309F21E35b41298C71d370c0d0A9313C'});
export function deploymentPlan(kind,env=process.env){
 const base={kind:'UNSIGNED_DEPLOYMENT_PLAN',network:'whitechain-sepolia',chainId:1874,status:'NOT_SUBMITTED',broadcastAuthorized:false,fundingStatus:'UNCONFIRMED',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sender:operators.deployer};
 if(kind==='infrastructure')return {...base,deployments:[{contract:'contracts/SeatRegistry.sol:SeatRegistry',constructorArgs:[operators.attester]},{contract:'contracts/SafeSetup.sol:SafeSetup',constructorArgs:[anchors.singleton]}],factory:anchors.factory,founderSeats:[],requiredApproval:'H review of exact infrastructure constructors; no signing approved'};
 if(kind!=='treasury'||!/^0x[0-9a-f]{64}$/.test(env.VENTURE_ID||'')||!/^0x[0-9a-f]{64}$/.test(env.TREASURY_SALT||'')||!env.VESTIGE_DB_PATH)throw new Error('TREASURY_PLAN_INPUTS_REQUIRED');
 for(const n of ['SEAT_REGISTRY_ADDRESS','SAFE_SETUP_ADDRESS'])if(!/^0x[0-9a-fA-F]{40}$/.test(env[n]||''))throw new Error('CONFIRMED_INFRASTRUCTURE_REQUIRED');
 const db=new DatabaseSync(env.VESTIGE_DB_PATH,{readOnly:true});let seats;
 try{seats=db.prepare('SELECT s.wallet,s.world_status,s.onchain_status,w.environment FROM identity_seats s LEFT JOIN identity_world_nullifiers w ON s.venture_id=w.venture_id AND s.wallet=w.wallet WHERE s.venture_id=?').all(env.VENTURE_ID);}finally{db.close();}
 if(seats.length!==2||seats.some(s=>s.world_status!=='VERIFIED'||s.onchain_status!=='VERIFIED'))throw new Error('TWO_CONFIRMED_SEATS_REQUIRED');
 const source=seats.every(s=>s.environment==='production')?'WORLD_PRODUCTION':seats.some(s=>s.environment==='staging')?'TESTED_IN_SIMULATOR':'UNKNOWN';
 if(source==='UNKNOWN')throw new Error('UNKNOWN_SEAT_SOURCE');
 return {...base,source,realHumanClaimAllowed:source==='WORLD_PRODUCTION',ventureId:env.VENTURE_ID,owners:seats.map(s=>s.wallet),threshold:2,registry:env.SEAT_REGISTRY_ADDRESS,setup:env.SAFE_SETUP_ADDRESS,salt:env.TREASURY_SALT,singleton:anchors.singleton,factory:anchors.factory,delegatecall:'SafeSetup.install only during initialization',fallbackHandler:'0x'+'0'.repeat(40),payment:'0',requiredApproval:'H must approve simulation parameters separately; staging is never real-human evidence'};
}
