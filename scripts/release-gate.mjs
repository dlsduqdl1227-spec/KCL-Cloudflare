import fs from 'node:fs';
import path from 'node:path';
import {root,runSuite} from './test-runner.mjs';
import {releaseIdentity} from './release-identity.mjs';

// A portable, tested source artifact also works with a static Pages build that
// does not execute dependency lifecycle scripts. Never label a source ID as a Git commit.
const stamp=path.join(root,'lib/release-info.mjs'),publicStamp=path.join(root,'public/ops-build.json');
for(const file of [stamp,publicStamp])if(fs.existsSync(file))fs.unlinkSync(file);
const result=runSuite('critical');
if(!result.ok)process.exit(1);
const info={schemaVersion:1,...releaseIdentity(root),testedAt:new Date().toISOString(),gate:{status:'passed',suite:'critical',tests:result.tests,passed:result.passed}};
fs.mkdirSync(path.dirname(stamp),{recursive:true});fs.writeFileSync(stamp,'export const RELEASE_INFO = '+JSON.stringify(info)+';\n');fs.writeFileSync(publicStamp,JSON.stringify(info,null,2)+'\n');
console.log('KCL_RELEASE_GATE_PASSED '+info.sourceId);
