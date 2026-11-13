import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export function discover(){
  const all=fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n);
  const browser=all.filter(p=>/createBrowserFixture|from ['"][^'"]*playwright|chromium\.launch/.test(fs.readFileSync(path.join(root,p),'utf8')));
  const api=all.filter(p=>!browser.includes(p));
  const criticalPrefixes=[113,136,138,146,148,187,195,197,198,200,205,207,219,248,255,283,287,288,289,290,291,292,293,294,295,296,297,298,299];
  const critical=api.filter(p=>criticalPrefixes.some(n=>p.startsWith('tests/stage'+n+'-')));
  return {schemaVersion:1,api,browser,critical};
}
export function validateCatalog(){
  const expected=JSON.parse(fs.readFileSync(path.join(root,'tests/test-plan.json'),'utf8')),actual=discover();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('테스트 목록이 바뀌었습니다. node scripts/kcl.mjs catalog 로 새 테스트를 등록하세요.');
  return actual;
}
export function runSuite(suite,options={}){
  if(Number(process.versions.node.split('.')[0])!==24)throw new Error('재현 가능한 검증을 위해 Node.js 24를 사용하세요.');
  const plan=validateCatalog();if(!['api','browser','critical'].includes(suite))throw new Error('알 수 없는 검증 범위입니다.');
  const outDir=path.resolve(root,options.outputDir||'tmp/kcl-checks');fs.mkdirSync(outDir,{recursive:true});
  const log=path.join(outDir,suite+'.tap'),report=path.join(outDir,suite+'.json');
  const env={...process.env,FORCE_COLOR:'0',KCL_TESTING:'1'};
  delete env.NODE_TEST_CONTEXT;
  for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','KCL_ADMIN_PASSWORD','KCL_ADMIN_PIN','KCL_ADMIN_SECRET_CODE','ADMIN_PASSWORD','ADMIN_SECRET_CODE','SOLAPI_API_KEY','SOLAPI_API_SECRET'])delete env[key];
  const startedAt=new Date().toISOString();
  const result=spawnSync(process.execPath,['--test','--test-concurrency='+String(suite==='browser'?2:4),'--test-reporter=tap','--test-reporter-destination='+log,...plan[suite]],{cwd:root,env,encoding:'utf8',timeout:suite==='browser'?25*60*1000:180000,maxBuffer:16*1024*1024});
  const text=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';
  const number=name=>Number(text.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]||0);
  const summary={schemaVersion:1,suite,startedAt,finishedAt:new Date().toISOString(),files:plan[suite].length,tests:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped'),exitCode:result.status??1,
    ok:result.status===0&&number('tests')>0&&number('fail')===0,failures:[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1]),log:path.relative(root,log)};
  fs.writeFileSync(report,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary));
  if(!summary.ok){
    const lines=text.split('\n');
    for(let i=0;i<lines.length;i++)if(/^not ok /.test(lines[i]))console.error(lines.slice(Math.max(0,i-38),i+24).join('\n'));
    console.error(lines.slice(-15).join('\n')||result.error?.message||result.stderr);
  }
  return summary;
}
