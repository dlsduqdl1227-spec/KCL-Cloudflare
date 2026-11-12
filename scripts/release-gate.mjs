import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root,runSuite} from './test-runner.mjs';

// Imported by the Pages endpoints: a failed gate cannot leave an old approval file behind.
const stamp=path.join(root,'lib/verified-release.mjs'),publicStamp=path.join(root,'public/ops-build.json');
for(const file of [stamp,publicStamp])if(fs.existsSync(file))fs.unlinkSync(file);
const result=runSuite('critical');
if(!result.ok)process.exit(1);
let commit=process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||'';
if(!commit)try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('배포 커밋을 확인하지 못했습니다. 원본 Git 저장소에서 검증하세요.');
const sources={};for(const name of ['functions/api/rpc.js','functions/api/operations.js','functions/api/health.js','lib/ops-auth.mjs','public/assessment/index.html'])sources[name]=createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const info={schemaVersion:1,commit,builtAt:new Date().toISOString(),gate:{status:'passed',suite:'critical',tests:result.tests,passed:result.passed},sources};
fs.mkdirSync(path.dirname(stamp),{recursive:true});fs.writeFileSync(stamp,'export const RELEASE_INFO = '+JSON.stringify(info)+';\n');fs.writeFileSync(publicStamp,JSON.stringify(info,null,2)+'\n');
console.log('KCL_RELEASE_GATE_PASSED '+commit);
