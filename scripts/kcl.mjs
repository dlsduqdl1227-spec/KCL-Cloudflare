import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,discover,runSuite} from './test-runner.mjs';

const [command='check',...args]=process.argv.slice(2);
if(command==='catalog'){
  fs.writeFileSync(path.join(root,'tests/test-plan.json'),JSON.stringify(discover(),null,2)+'\n');console.log('테스트 목록 등록 완료');
}else if(command==='check'){
  const suite=args.includes('--critical')?'critical':args.includes('--browser')?'browser':'api';
  const result=runSuite(suite);if(!result.ok)process.exitCode=1;
}else if(command==='doctor'){
  let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
  console.log(JSON.stringify({node:process.version,nodeReady:Number(process.versions.node.split('.')[0])===24,commit,testFiles:discover().api.length,browserFiles:discover().browser.length,
    deployMethod:'GitHub main -> Cloudflare Pages',cloudflareTokenRequiredForGitDeployment:false,cloudflareTokenConfigured:!!process.env.CLOUDFLARE_API_TOKEN,
    runtimeHealth:'https://kcl-cloudflare.pages.dev/api/health',liveAudit:'GitHub Actions > KCL Cloud > live-audit (short-lived OIDC, read-only)'},null,2));
}else if(command==='live'){
  await import('./cloud-audit.mjs');
}else throw new Error('사용법: node scripts/kcl.mjs doctor | check [--critical|--browser] | catalog | live');
