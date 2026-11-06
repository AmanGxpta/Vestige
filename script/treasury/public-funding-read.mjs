import {publicFundingRead} from '../../src/modules/treasury/operator-review.mjs';
try{console.log(JSON.stringify(await publicFundingRead(process.env.WHITECHAIN_RPC_URL),null,2));}catch{console.error('PUBLIC_FUNDING_READ_UNVERIFIED');process.exitCode=1;}
