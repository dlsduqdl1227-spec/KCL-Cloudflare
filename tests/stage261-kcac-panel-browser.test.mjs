import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const roles=['패턴디자인 헤드 심사위원','패턴디자인 헤드 심사위원','일반우유 센서리 헤드 심사위원','오트 센서리 헤드 심사위원'];
const types=['final-pattern','final-pattern','sensory-regular','sensory-oat'];
fs.mkdirSync('tmp/stage261-qa',{recursive:true});
try{
 await api.rpc('upsertParticipant',{competitionCode:'KCAC',name:'블라인드 선수',phone:'01010001000',uniqueNo:'1',prelimCupNo:'1',finalCupNo:'1'},api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,optionSettings:{kcacFinalPanelMode:'split-four-heads-160'}},api.actor);
 const configs=(await api.rpc('getConfig')).configs;
 for(let i=0;i<4;i++){
  await api.rpc('upsertOperatorAccount',{name:'UI 헤드'+i,phone:'0107111000'+i,access:'KCAC',accountType:'JUDGE',role:roles[i]},api.actor);
  const actor=await api.rpc('judgeLogin','UI 헤드'+i,'0107111000'+i);
  const page=await qa.page(i%2?1440:390,900);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCAC');startKcac('sensory-oat');},{actor,configs});
  await page.waitForSelector('#evalKcac.active');
  await page.waitForFunction(()=>document.querySelector('#kcac-attrs .score-row,#kcac-attrs .kcac-attr-card'));
  const state=await page.evaluate(()=>({jars:_kcac.jars.map(j=>({type:j.type,patternType:j.patternType})),area:_kcac.finalArea,draft:kclDraftKey_('KCAC')}));
  assert.equal(state.jars.length,1);assert.equal(state.jars[0].patternType,types[i]);
  assert.ok(state.draft.includes(state.area));
  assert.match(await page.locator('#kcac-sub').innerText(),/창작 주제: 동물/);
  assert.equal(await page.locator('#pKcacFinalArea').isVisible(),false,'assigned heads cannot choose another area');
  assert.equal(await page.locator('#kcac-name').isVisible(),false,'blind identities remain hidden');
  await page.waitForFunction(()=>participantAssignmentByNumber_('KCAC','1'));
  await page.evaluate(()=>{document.getElementById('kcac-num').value='1';onKcacParticipantSelected_();const j=_kcac.jars[0];Object.keys(j.scores).forEach(k=>j.scores[k]=5);j.comment='내 담당 잔 평가 기록';loadKcacJar(0);});
  await page.waitForTimeout(120);
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.screenshot({path:`tmp/stage261-qa/head-${i}.png`});
  await page.evaluate(()=>kcacSubmitAll());
  await page.waitForFunction(()=>!document.getElementById('overlay').classList.contains('active'));
  const stored=api.db.prepare("SELECT * FROM scores WHERE judge_name=?").all('UI 헤드'+i);
  assert.equal(stored.length,1,await page.locator('#toast').innerText());
  assert.equal(stored[0].total_score,i<2?60:20);
  assert.match(stored[0].payload_json,/내 담당 잔 평가 기록/);
  assert.match(stored[0].payload_json,/동물/);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
 }
 assert.equal((await api.rpc('getRanking','KCAC',api.actor,'결선')).ranking[0].score,160);
 const page=await qa.page(390,900);await page.goto(qa.origin+'/registry/');
 const options=await page.evaluate(()=>{const comp=document.getElementById('comp');comp.innerHTML='<option value="KCAC">KCAC</option>';document.getElementById('opType').value='JUDGE';syncOperatorRoleOptions();return [...document.getElementById('opRole').options].map(o=>o.value)});
 for(const role of new Set(roles))assert.ok(options.includes(role));
 await page.close();
 console.log('Stage261 browser: assigned single-cup forms, blind identity, animal theme, independent drafts, real UI submission and 160-point ranking passed.');
}finally{await qa.close();api.close();}
