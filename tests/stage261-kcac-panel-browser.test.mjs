import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage,selectOperationsCompetition} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const roles=['패턴디자인 헤드 심사위원','패턴디자인 헤드 심사위원','일반우유 센서리 헤드 심사위원','오트 센서리 헤드 심사위원'];
const types=['final-pattern','final-pattern','sensory-regular','sensory-oat'];
async function login(page,name,phone) {
 await page.goto(qa.origin+'/assessment/');
 await page.locator('#inp-name').fill(name);
 await page.locator('#inp-phone').fill(phone);
 await page.locator('#judge-login-button').click();
}
fs.mkdirSync('tmp/stage261-qa',{recursive:true});
try{
 await api.rpc('upsertParticipant',{competitionCode:'KCAC',name:'블라인드 선수',phone:'01010001000',uniqueNo:'1',prelimCupNo:'1',finalCupNo:'1'},api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,optionSettings:{kcacFinalPanelMode:'split-four-heads-160'}},api.actor);
 await api.rpc('upsertOperatorAccount',{name:'KCAC 운영 QA',phone:'01071110009',access:'KCAC',accountType:'TEAMLEAD',role:'대회팀장'},api.actor);
 const roster=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
 for(const [name,phone,mode] of [[api.actor.name,api.actor.phone,'admin'],['KCAC 운영 QA','01071110009','team']]){
  const page=await qa.page(360,900);
  await login(page,name,phone);
  if(mode==='admin')await selectOperationsCompetition(page,'KCAC');
  else await page.locator('#pTeam.active #team-comp-list .admin-comp-card').waitFor();
  const entry=page.locator(mode==='admin'?'#admin-comp-list [data-workspace-competition=KCAC] [data-act=eval]':'#team-comp-list [data-act=eval]');
  assert.equal(await entry.isVisible(),true,mode+' must have a real menu entry for KCAC final score sheets');
  assert.equal(await entry.innerText(),'결선 평가표');
  const areas=['pattern','sensory-regular','sensory-oat'];
  const labels=['패턴디자인 (1잔 · 60점)','일반우유 센서리 (1잔 · 20점)','어메이징오트바리스타 센서리 (1잔 · 20점)'];
  const draftKeys=[];
  let savedPatternDraft;
  for(const [i,area] of areas.entries()){
   await entry.click();
   const chooser=page.locator('#pKcacFinalArea.active');
   await chooser.waitFor();
   assert.equal(await chooser.locator('button[onclick^="startKcac"]').count(),3);
   assert.equal((await inspectPage(page)).pageOverflow,false);
   await chooser.getByRole('button',{name:labels[i],exact:true}).click();
   assert.equal(await page.locator('#kcac-final-entry-guide').isVisible(),true);
   await page.locator('#kcac-participant-select option[value="0"]').waitFor({state:'attached'});
   await page.locator('#kcac-participant-select').selectOption('0');
   const input=page.locator('#kcac-attrs input[data-kcac-score="'+(i?'맛균형':'주제표현')+'"]');
   await input.waitFor();
   await page.locator('#kcac-submit-dock .submit-btn-nav').waitFor();
   const sheet=await page.evaluate(()=>{
    const body=document.getElementById('kcac-evaluation-body'),fields=[...document.querySelectorAll('#kcac-attrs input[data-kcac-score]')];
    return {active:document.getElementById('evalKcac').classList.contains('active'),number:document.getElementById('kcac-num').value,body:body.style.display,fields:fields.length,visible:fields.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible').length};
   });
   assert.equal(sheet.visible,i===0?6:3,mode+' '+area+' '+JSON.stringify(sheet));
   assert.deepEqual(await page.evaluate(()=>_kcac.jars.map(j=>j.patternType)),[i===0?'final-pattern':area]);
   draftKeys.push(await page.evaluate(()=>kclDraftKey_('KCAC')));
   assert.equal((await inspectPage(page)).pageOverflow,false);
   if(i===0){
    await input.fill('4.2');
    await page.locator('#kcac-comment').fill('패턴 평가 원본 기록');
   }
   await page.getByRole('button',{name:'현재 화면에서 이전 단계로 이동',exact:true}).click();
   if(i===0)savedPatternDraft=await page.evaluate(key=>localStorage.getItem(key),draftKeys[0]);
  }
  assert.equal(new Set(draftKeys).size,3);
  assert.match(savedPatternDraft,/패턴 평가 원본 기록/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),draftKeys[0]),savedPatternDraft);
  await entry.click();
  await page.locator('#pKcacFinalArea').getByRole('button',{name:labels[0],exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('kcac-comment').value==='패턴 평가 원본 기록');
  assert.equal(await page.locator('#kcac-attrs input[data-kcac-score="주제표현"]').inputValue(),'4.2');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),roster);
 assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,0);
 for(let i=0;i<4;i++){
  await api.rpc('upsertOperatorAccount',{name:'UI 헤드'+i,phone:'0107111000'+i,access:'KCAC',accountType:'JUDGE',role:roles[i]},api.actor);
  const page=await qa.page(i%2?1440:390,900);
  await login(page,'UI 헤드'+i,'0107111000'+i);
  await page.locator('#pSelect.active #comp-list .comp-card').click();
  await page.locator('#btn-eval').click();
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
 console.log('Stage261 browser: admin and team lead open all three real menus; drafts survive switching; four heads log in, open assigned forms and submit for 160 points.');
}finally{await qa.close();api.close();}
