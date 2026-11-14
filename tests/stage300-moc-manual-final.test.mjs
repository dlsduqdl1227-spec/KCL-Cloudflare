import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import fs from 'node:fs';
import {createMocManualFinalFixture} from './helpers/moc-manual-final-fixture.mjs';
import {applyMocFinalResult,verifyMocFinalResultPlan,MOC_FINAL_RESULT_KEY} from '../lib/moc-final-result-20261114.mjs';
const saved=api=>api.db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(MOC_FINAL_RESULT_KEY);

test('MOC rank-only finals use the supplied ranks and existing identities, preserve all scores and main results, and select finals by default',async()=>{
  const api=await createMocManualFinalFixture();try{
    const before=api.snapshot(),main=await api.rpc('getRanking','MOC',api.actor,'본선'),kbc=await api.rpc('getRanking','KBC',api.actor);
    assert.equal(await applyMocFinalResult(api.env.DB,api.entries),true);assert.equal(api.snapshot(),before);
    const final=await api.rpc('getRanking','MOC',api.actor,'결선');assert.equal(final.currentRound,'결선');assert.equal(final.ranking.length,10);
    assert.deepEqual(final.ranking.map(r=>r.playerNameSummary),api.entries.map(e=>e.name));assert.deepEqual(final.ranking.map(r=>r.rank),api.entries.map(e=>e.rank));
    assert.deepEqual(final.ranking.map(r=>r.unit),Array.from({length:10},(_,i)=>String(110-i)),'rank never renumbers the entrants');
    for(const row of final.ranking){assert.equal(row.manualRankingOnly,true);assert.equal(row.totalScore,null);assert.equal(row.rankingScore,null);}
    assert.deepEqual((await api.rpc('getRanking','MOC',api.actor,'본선')).ranking,main.ranking);assert.deepEqual(await api.rpc('getRanking','KBC',api.actor),kbc);
    assert.equal((await api.audit('MOC')).status,'ok');assert.equal(await applyMocFinalResult(api.env.DB,api.entries),true);assert.equal(api.snapshot(),before);
    const denied=await(await api.handle({action:'getRanking',args:['MOC',{},'결선']})).json();assert.equal(denied.success,false);
  }finally{api.close();}
});

test('a rank-only final is available through ranking detail, preview options, public debrief and reports without inventing scores',async()=>{
  const api=await createMocManualFinalFixture();try{
    await applyMocFinalResult(api.env.DB,api.entries);const before=api.snapshot();
    const detail=await api.rpc('getRankingDetail','MOC','110','결선',api.actor);assert.equal(detail.rankInfo.rank,1);assert.equal(detail.totalScore,null);assert.equal(detail.rows.length,0);
    const preview=await api.rpc('getAdminDebriefPreview','MOC','110','결선',api.actor);assert.equal(preview.rankInfo.rank,1);assert.deepEqual(preview.scores,[]);
    const options=await api.rpc('getAdminDebriefPreviewOptions','MOC',api.actor);assert.equal(options.options.filter(r=>r.round==='결선').length,10);
    const published=await api.publicView({code:'MOC',name:api.entries[0].name,phone:api.moc.phone});assert.equal(published.success,true);assert.equal(published.rankInfos.length,1);assert.equal(published.rankInfo.rank,1);assert.equal(published.rankInfo.totalScore,null);assert.deepEqual(published.scores,[]);
    const report=await api.rpc('getFinalReport','MOC',api.actor,'결선');assert.equal(report.ranking.length,10);assert.equal(report.ranking[0].totalScore,null);assert.equal(api.snapshot(),before);
  }finally{api.close();}
});

test('existing final score sheets remain intact and cannot replace the supplied manual order',async()=>{
  const api=await createMocManualFinalFixture();try{
    const payload={competitionCode:'MOC',round:'결선',rows:[{data:['101'],extraFields:{참가자번호:'101',총점:87.5,종합코멘트:'기존 결선 원문'}}]};
    api.db.prepare("INSERT INTO scores(competition_code,round,unit,participant_name,total_score,review_status,submitted_at,payload_json) VALUES('MOC','결선','101',?,87.5,'검수완료','QA',?)").run(api.entries[9].name,JSON.stringify(payload));
    const before=api.snapshot();await applyMocFinalResult(api.env.DB,api.entries);const ranked=await api.rpc('getRanking','MOC',api.actor,'결선');
    assert.equal(ranked.ranking[9].playerNameSummary,api.entries[9].name);assert.equal(ranked.ranking[9].rank,10);assert.equal(ranked.ranking[9].totalScore,null);assert.equal(api.snapshot(),before);
    const detail=await api.rpc('getRankingDetail','MOC','101','결선',api.actor);assert.ok(detail.rows.some(r=>r['종합코멘트']==='기존 결선 원문'));assert.equal(detail.rankInfo.rank,10);
  }finally{api.close();}
});

test('a blank finalist flag can use the existing participant number without treating the manual rank as a number',async()=>{
  const api=await createMocManualFinalFixture();try{
    api.db.prepare("UPDATE participants SET final_cup_no='' WHERE competition_code='MOC' AND name=?").run(api.entries[0].name);
    assert.equal(await applyMocFinalResult(api.env.DB,api.entries),true);const ranked=await api.rpc('getRanking','MOC',api.actor,'결선');assert.equal(ranked.ranking[0].unit,'301');assert.equal(ranked.ranking[0].rank,1);
  }finally{api.close();}
});

for(const kind of ['missing','duplicate','collision'])test('no partial final result is stored when a target is '+kind,async()=>{
  const api=await createMocManualFinalFixture();try{
    if(kind==='missing')api.db.prepare("DELETE FROM participants WHERE competition_code='MOC' AND name=?").run(api.entries[0].name);
    if(kind==='duplicate')api.db.prepare("INSERT INTO participants(competition_code,name,unique_no) VALUES('MOC',?,'9999')").run(api.entries[0].name);
    if(kind==='collision')api.db.prepare("UPDATE participants SET final_cup_no='110' WHERE competition_code='MOC' AND name=?").run(api.entries[1].name);
    const before=api.snapshot();assert.equal(await applyMocFinalResult(api.env.DB,api.entries),false);assert.equal(saved(api),undefined);assert.equal(api.snapshot(),before);assert.equal(api.db.prepare("SELECT current_round FROM competitions WHERE code='MOC'").get().current_round,'본선');
  }finally{api.close();}
});

test('a concurrent roster edit blocks the whole batch and completed requests do not overwrite later round changes',async()=>{
  let change=null;const api=await createMocManualFinalFixture({beforeBatch:()=>{if(change){change();change=null;}}});try{
    change=()=>api.db.prepare("UPDATE participants SET updated_at='concurrent' WHERE competition_code='MOC' AND name=?").run(api.entries[0].name);
    assert.equal(await applyMocFinalResult(api.env.DB,api.entries),false);assert.equal(saved(api),undefined);
    assert.equal(await applyMocFinalResult(api.env.DB,api.entries),true);api.db.prepare("UPDATE competitions SET current_round='본선' WHERE code='MOC'").run();assert.equal(await applyMocFinalResult(api.env.DB,api.entries),true);assert.equal(api.db.prepare("SELECT current_round FROM competitions WHERE code='MOC'").get().current_round,'본선');
  }finally{api.close();}
});

test('the private signature rejects changes of entrant, rank, nonce and preview/foreign origins; authenticated RPC status is preserved',async()=>{
  const api=await createMocManualFinalFixture();try{
    const plan={version:1,nonce:'b'.repeat(64),entries:api.entries};const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=pair.publicKey.export({format:'jwk'});plan.signature=sign('sha256',Buffer.from(JSON.stringify(plan)),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
    assert.equal(await verifyMocFinalResultPlan(plan,publicKey),true);assert.equal(await verifyMocFinalResultPlan(plan),false);
    assert.equal(await verifyMocFinalResultPlan({...plan,entries:[...plan.entries].reverse()},publicKey),false);
    assert.equal(await verifyMocFinalResultPlan({...plan,nonce:'c'.repeat(64)},publicKey),false);
    const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
    const module=fs.readFileSync(new URL('../lib/moc-final-result-20261114.mjs',import.meta.url),'utf8').replace(/export const MOC_FINAL_RESULT_PUBLIC_KEY=.*;/,'export const MOC_FINAL_RESULT_PUBLIC_KEY='+JSON.stringify(publicKey)+';');
    let source=fs.readFileSync(new URL('../functions/api/_middleware.js',import.meta.url),'utf8');
    for(const path of ['moc-final-registration.mjs','kbc-final-order-20261113.mjs','deployment-correction-20261113.mjs'])source=source.replace('../../lib/'+path,new URL('../lib/'+path,import.meta.url).href);
    source=source.replace('../../lib/moc-final-result-20261114.mjs',url(module));const {onRequest}=await import(url(source));
    const request=(host,origin)=>new Request(host+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-KCL-Correction':'20261114-moc-final-result',...(origin?{Origin:origin}:{})},body:JSON.stringify({action:'getConfig',args:[],mocFinalResult:plan})});
    for(const req of [request('https://preview.kcl-cloudflare.pages.dev'),request('https://kcl-cloudflare.pages.dev','https://foreign.test')])await onRequest({request:req,env:api.env,next:()=>new Response('next')});assert.equal(saved(api),undefined);
    const result=await onRequest({request:request('https://kcl-cloudflare.pages.dev'),env:api.env,next:()=>new Response('denied',{status:401,headers:{'X-QA':'preserved'}})});
    assert.equal(result.status,401);assert.equal(result.headers.get('X-QA'),'preserved');assert.equal(result.headers.get('X-KCL-MOC-Result'),'applied');assert.equal(JSON.parse(saved(api).setting_value).entries.length,10);
  }finally{api.close();}
});

test('only the MOC team lead and admin can enter final scores/times, with rank preservation, persistence and edit conflict protection',async()=>{
  const api=await createMocManualFinalFixture();try{
    await applyMocFinalResult(api.env.DB,api.entries);
    const leadName=api.moc.name+' 테스트 팀장';await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:leadName,phone:api.moc.phone,access:'MOC',role:'대회팀장'},api.actor);
    const lead=await api.rpc('judgeLogin',leadName,api.moc.phone),id=JSON.parse(saved(api).setting_value).entries[0].participantId;
    const before=api.snapshot(),payload={participantId:id,revision:0,score:'23.5',elapsedTime:'4분 30.25초',rank:10};
    const denied=await(await api.handle({action:'updateMocFinalResult',args:[payload,{}]})).json();assert.equal(denied.success,false);
    for(const [type,role,code,fixture] of [['JUDGE','센서리 심사위원','MOC',api.moc],['TEAMLEAD','대회팀장','KBC',api.cases.find(c=>c.code==='KBC')]]){
      const name=fixture.name+' 권한 테스트 '+type;await api.rpc('upsertOperatorAccount',{accountType:type,name,phone:fixture.phone,access:code,role},api.actor);const actor=await api.rpc('judgeLogin',name,fixture.phone);
      const rejected=await(await api.handle({action:'updateMocFinalResult',args:[payload,actor]})).json();assert.equal(rejected.success,false,'only the assigned MOC manager may change results');
    }
    const edited=await api.rpc('updateMocFinalResult',payload,lead);assert.equal(edited.rank,1);assert.equal(edited.score,23.5);assert.equal(edited.elapsedTime,'04:30.25');
    let ranking=await api.rpc('getRanking','MOC',api.actor,'결선');assert.equal(ranking.ranking[0].rank,1);assert.equal(ranking.ranking[0].totalScore,23.5);assert.equal(ranking.ranking[0].endTimeDisplay,'04:30.25');assert.equal(ranking.ranking[0].manualFinalResult,true);
    const stale=await(await api.handle({action:'updateMocFinalResult',args:[{...payload,score:99},lead]})).json();assert.equal(stale.code,'MOC_FINAL_EDIT_CONFLICT');
    const badTime=await(await api.handle({action:'updateMocFinalResult',args:[{...payload,revision:1,elapsedTime:'99:99'},lead]})).json();assert.equal(badTime.success,false);
    const preview=await api.rpc('getAdminDebriefPreview','MOC','110','결선',api.actor);assert.equal(preview.rankInfo.totalScore,23.5);assert.equal(preview.rankInfo.endTimeDisplay,'04:30.25');
    await api.rpc('updateMocFinalResult',{...payload,revision:1,score:0,elapsedTime:'00:01'},api.actor);ranking=await api.rpc('getRanking','MOC',api.actor,'결선');assert.equal(ranking.ranking[0].totalScore,0);assert.equal(ranking.ranking[0].rank,1);
    assert.equal(api.snapshot(),before);assert.equal((await api.audit('MOC')).status,'ok');
  }finally{api.close();}
});

test('concurrent edits to separate finalists preserve both entries while concurrent edits to one finalist have one winner',async()=>{
  const api=await createMocManualFinalFixture();try{
    await applyMocFinalResult(api.env.DB,api.entries);const entries=JSON.parse(saved(api).setting_value).entries;
    const edit=(index,score)=>api.handle({action:'updateMocFinalResult',args:[{participantId:entries[index].participantId,revision:0,score,elapsedTime:'04:30'},api.actor]}).then(r=>r.json());
    const results=await Promise.all([edit(0,11),edit(1,22)]);assert.ok(results.every(r=>r.success));
    const one=await Promise.all([edit(2,33),edit(2,44)]);assert.equal(one.filter(r=>r.success).length,1);assert.equal(one.filter(r=>r.code==='MOC_FINAL_EDIT_CONFLICT').length,1);
    const ranked=(await api.rpc('getRanking','MOC',api.actor,'결선')).ranking;assert.equal(ranked[0].totalScore,11);assert.equal(ranked[1].totalScore,22);assert.deepEqual(ranked.map(r=>r.rank),api.entries.map(e=>e.rank));
  }finally{api.close();}
});
