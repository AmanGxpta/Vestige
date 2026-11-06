import test from 'node:test';
import assert from 'node:assert/strict';
import {publishReviewedManifest} from '../../src/modules/treasury/publish-manifest.mjs';
import {relayConfiguration} from '../../src/modules/relayer/safety.mjs';
import {readFile} from 'node:fs/promises';
test('manifest publication cannot start without exact operator review',async()=>{
 await assert.rejects(publishReviewedManifest({candidatePath:'not-a-real-manifest.json',client:{}}),/MANIFEST_REVIEW_REQUIRED/);
});
test('proposed bounded configuration remains disabled and cannot become a live fee policy',async()=>{
 const proposal=JSON.parse(await readFile(new URL('../../contracts/interfaces/proposed-operator-bounds.json',import.meta.url),'utf8'));
 const c=relayConfiguration({...proposal.proposedEnv,RELAYER_ENABLED:'false'});assert.equal(c.enabled,false);assert.equal(c.limits,null);assert.ok(c.missing.includes('RELAYER_L1_FEE_RESERVE_WEI'));
 assert.throws(()=>relayConfiguration({...proposal.proposedEnv,RELAYER_ENABLED:'true'}),/UNCONFIGURED/);
});
