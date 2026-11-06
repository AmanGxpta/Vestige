import {readback} from '../../src/modules/treasury/readback.mjs';
try{console.log(JSON.stringify(await readback(process.argv[2],process.env.WHITECHAIN_RPC_URL),(_,v)=>typeof v==='bigint'?String(v):v,2));}catch{console.error('MANIFEST_OR_CHAIN_READBACK_UNVERIFIED');process.exitCode=1;}
