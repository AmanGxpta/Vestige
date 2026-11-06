import {deploymentPlan} from '../../src/modules/treasury/deployment-plan.mjs';
try{console.log(JSON.stringify(deploymentPlan(process.argv[2]),null,2));}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PLAN_UNAVAILABLE');process.exitCode=1;}
