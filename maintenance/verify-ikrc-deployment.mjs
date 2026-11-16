// Read-only production checks. Only public build identity and job conclusions
// are returned through a separate status branch; no competition data is read.
const repository='dlsduqdl1227-spec/KCL-Cloudflare';
const target='7955b073fffc7144df99164ae45bc8246c7dc4a9';
const expectedSource='3c263d851275ae0d6643a2f4030aa0448731d5a55624f4a1d8dfebf5b4c0186c';
const reportBranch='ops/ikrc-deploy-result-7955b07';
const base='https://api.github.com/repos/'+repository;
async function api(path,method='GET',body){
 const res=await fetch(base+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error('GitHub '+method+' '+res.status);
 return res.json();
}
let reportHead;
async function publish(report){
 const tree=await api('/git/trees','POST',{tree:[{path:'deployment-result.json',mode:'100644',type:'blob',content:JSON.stringify(report,null,2)+'\n'}]});
 const commit=await api('/git/commits','POST',{message:'Verify IKRC deployment '+target.slice(0,7),tree:tree.sha,parents:reportHead?[reportHead]:[]});
 if(reportHead)await api('/git/refs/heads/'+reportBranch,'PATCH',{sha:commit.sha});
 else await api('/git/refs','POST',{ref:'refs/heads/'+reportBranch,sha:commit.sha});
 reportHead=commit.sha;
}
async function publicIdentity(path){
 try{
  const res=await fetch('https://kcl-cloudflare.pages.dev'+path+'?verify='+target,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  if(!res.ok)return false;
  const data=await res.json();
  return (path==='/api/health'?data.release?.sourceId:data.sourceId)===expectedSource;
 }catch{return false;}
}
const report={targetCommit:target,sourceId:expectedSource,state:'started',checkedAt:new Date().toISOString(),pages:null,healthMatches:false,staticBuildMatches:false,liveAudit:null};
await publish(report);
try{
 for(let attempt=0;attempt<24;attempt++){
  const checks=(await api('/commits/'+target+'/check-runs?per_page=100&filter=latest')).check_runs||[];
  const pages=checks.find(c=>c.name==='Cloudflare Pages'&&c.head_sha===target);
  const live=checks.find(c=>c.name==='live-audit'&&c.head_sha===target);
  report.pages=pages?{status:pages.status,conclusion:pages.conclusion,url:pages.details_url}:null;
  report.liveAudit=live?{status:live.status,conclusion:live.conclusion}:null;
  [report.healthMatches,report.staticBuildMatches]=await Promise.all([publicIdentity('/api/health'),publicIdentity('/ops-build.json')]);
  report.checkedAt=new Date().toISOString();
  if(pages?.status==='completed'&&pages.conclusion==='success'&&report.healthMatches&&report.staticBuildMatches){
   report.state='deployed';break;
  }
  if(pages?.status==='completed'&&['failure','cancelled','timed_out'].includes(pages.conclusion)){report.state='deployment-failed';break;}
  await new Promise(resolve=>setTimeout(resolve,25000));
 }
 if(report.state==='started')report.state='unconfirmed';
}catch(error){report.state='verification-error';report.error=error.message;}
await publish(report);
console.log(JSON.stringify(report));
if(report.state!=='deployed')process.exitCode=1;
