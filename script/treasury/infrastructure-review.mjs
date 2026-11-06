import {infrastructureReview} from '../../src/modules/treasury/operator-review.mjs';
try{console.log(JSON.stringify(await infrastructureReview(process.env.WHITECHAIN_RPC_URL),null,2));}catch{console.error('INFRASTRUCTURE_REVIEW_UNVERIFIED');process.exitCode=1;}
