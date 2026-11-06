import {publishManifestFiles} from '../../src/modules/treasury/publish-manifest.mjs';
try{console.log(JSON.stringify(await publishManifestFiles(process.argv[2],process.argv[3],process.env.WHITECHAIN_RPC_URL),null,2));}
catch{console.error('MANIFEST_NOT_PUBLISHED_REVIEW_OR_PROVENANCE_MISSING');process.exitCode=1;}
