import {inspectFees} from '../../src/modules/treasury/readback.mjs';
try{console.log(JSON.stringify(await inspectFees(process.argv.slice(2),process.env.WHITECHAIN_RPC_URL),null,2));}catch{console.error('FEE_MEASUREMENTS_UNAVAILABLE_OR_UNVERIFIED');process.exitCode=1;}
