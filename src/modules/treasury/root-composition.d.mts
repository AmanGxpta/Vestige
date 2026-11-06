import type {SqlDb,TreasuryStore} from './store.mjs';
import type {SeatAttestationPort,SeatAttester} from './seat-attestation.mjs';
interface IdentityServices {db:SqlDb;auth:{authenticate(req:Request):string}}
export function createRootComposition<I extends IdentityServices>(input:{identityModule:{registerSeatAttester(port:SeatAttestationPort):void;getIdentityServices(env:Record<string,string|undefined>):I};env:Record<string,string|undefined>;client?:unknown}):{ready():Promise<{identity:I;treasury:unknown;store:TreasuryStore;seatAttester:SeatAttester;client:unknown;mode:'READ_ONLY'}>};
