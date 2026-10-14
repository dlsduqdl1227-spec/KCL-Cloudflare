import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {buildFinalistPlan} from '../maintenance/finalist-plan.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage232-qa',{recursive:true});
try{
 const codes=['MOC','KBC','KCAC','KTCC','IKRC','MOB'];
 for(const code of codes)for(let i=1;i<=3;i++)await api.rpc('upsertParticipant',{competitionCode:code,name:'예선 '+i+'위',teamName:code==='KTCC'?'예선 '+i+'위':'',affiliation:'기존소속',phone:'0105555000'+i,uniqueNo:String(i),prelimCupNo:String(i),extra:{'대회일':'2026-08-06',note:'기존 기록',roundSchedules:{예선:{date:'2026-08-06'}}}},api.actor);
 const participants=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
 const selections=participants.map(p=>({id:p.id,code:p.competition_code,round:['MOC','KBC'].includes(p.competition_code)?'본선':'결선',rank:Number(p.prelim_cup_no),name:p.name,affiliation:p.affiliation}));
 const {sql}=buildFinalistPlan(participants,selections,{numbering:'reverse-rank',source:'QA user choice',timestamp:'2026-10-14T01:00:00Z'});api.db.exec(sql);
 assert.throws(()=>buildFinalistPlan(participants,selections.slice(1),{numbering:'reverse-rank',source:'QA',timestamp:'test'}),/전체 진출 순위/);
 for(const code of codes){
  const round=['MOC','KBC'].includes(code)?'본선':'결선';
  await api.rpc('updateCompetitionAdminSettings',{code,currentRound:round},api.actor);
  const before=await api.rpc('getParticipantRoundOrder',{competitionCode:code,round},api.actor);
  assert.deepEqual(before.participants.map(r=>[r.number,r.name]),[['1','예선 3위'],['2','예선 2위'],['3','예선 1위']]);
  assert.ok(before.participants.every(p=>p.date===''));
  // Already-evaluated cups must not be relabelled when the admin changes order.
  api.db.prepare('INSERT INTO scores(submitted_at,competition_code,round,unit,total_score,payload_json) VALUES(?,?,?,?,?,?)').run('2026-10-14',code,round,'1',77.2,'{"comment":"저장된 평가"}');
  const originalScores=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
  const ids=before.participants.map(p=>p.participantId).reverse();
  await api.rpc('saveParticipantRoundOrder',{competitionCode:code,round,revision:before.revision,participantIds:ids},api.actor);
  const after=await api.rpc('getParticipantRoundOrder',{competitionCode:code,round},api.actor);
  assert.deepEqual(after.participants.map(r=>[r.number,r.name]),[['3','예선 1위'],['2','예선 2위'],['1','예선 3위']]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),originalScores);
  const choices=await api.rpc('getParticipantAssignments',code,api.actor);
  assert.deepEqual(choices.assignments.map(p=>p.number),['3','2','1']);
  assert.deepEqual(choices.assignments.map(p=>p.performanceOrder),[1,2,3]);
  await api.rpc('updateCompetitionAdminSettings',{code,currentRound:'예선'},api.actor);
  const prelim=await api.rpc('getParticipantAssignments',code,api.actor);
  assert.deepEqual(prelim.assignments.map(p=>p.number),['1','2','3']);
  assert.ok(prelim.assignments.every(p=>p.display.startsWith('2026-08-06 · ')&&!p.display.includes('경연 ')));
  await api.rpc('updateCompetitionAdminSettings',{code,currentRound:round},api.actor);
  const stale=await(await api.handle({action:'saveParticipantRoundOrder',args:[{competitionCode:code,round,revision:before.revision,participantIds:ids},api.actor]})).json();assert.equal(stale.success,false);
  const duplicate=await(await api.handle({action:'saveParticipantRoundOrder',args:[{competitionCode:code,round,revision:after.revision,participantIds:[ids[0],ids[0],ids[2]]},api.actor]})).json();assert.equal(duplicate.success,false);
  const invalidRound=await(await api.handle({action:'getParticipantRoundOrder',args:[{competitionCode:code,round:'예선'},api.actor]})).json();assert.equal(invalidRound.success,false);
 }
 const moc=(await api.rpc('listParticipants','MOC',api.actor)).participants;
 assert.ok(moc&&moc.length===3);
 const edited=moc[0],order=edited.extra.roundSchedules.본선.order;
 edited.extra.roundSchedules.본선.order=99;edited.extra.roundSchedules.본선.date='2026-11-01';
 await api.rpc('upsertParticipant',edited,api.actor);
 const preserved=JSON.parse(api.db.prepare('SELECT extra_json FROM participants WHERE id=?').get(edited.rowIndex).extra_json);
 assert.equal(preserved.roundSchedules.본선.order,order);assert.equal(preserved.roundSchedules.본선.date,'2026-11-01');
 assert.equal(preserved.roundSchedules.예선.date,'2026-08-06');
 await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'순서 헤드',phone:'01076660001',access:'MOC',role:'헤드 심사위원'},api.actor);
 const judge=await api.rpc('judgeLogin','순서 헤드','01076660001');
 const denied=await(await api.handle({action:'getParticipantRoundOrder',args:[{competitionCode:'MOC',round:'본선'},judge]})).json();assert.equal(denied.success,false);
 const scoresBefore=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
 for(const width of [360,768,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/registry/');
  await page.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);
  await page.locator('#comp option[value=MOC]').waitFor({state:'attached'});await page.locator('#comp').selectOption('MOC');
  await page.locator('#finalistOrder summary').click();await page.locator('#finalistOrderRows li').first().waitFor();
  assert.equal(await page.locator('#finalistOrderRound').inputValue(),'본선');
  const before=await page.locator('#finalistOrderRows strong').allTextContents();
  const input=page.locator('#finalistOrderRows input').last();await input.fill('1');await input.dispatchEvent('change');
  assert.equal(await page.locator('#finalistOrderRows strong').first().innerText(),before[2]);
  await page.locator('#finalistOrderSave').click();
  await page.waitForFunction(()=>document.getElementById('finalistOrderSave').disabled&&document.querySelectorAll('#finalistOrderRows li').length===3&&!document.getElementById('finalistOrderLoad').disabled);
  assert.match(await page.locator('#finalistOrderStatus').innerText(),/경연순서 저장 완료/);
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.locator('#finalistOrder').screenshot({path:`tmp/stage232-qa/order-${width}.png`});
  await page.locator('#finalistOrderRound').selectOption('결선');await page.waitForFunction(()=>document.getElementById('finalistOrderStatus').textContent.includes('배정된 진출자가 없습니다'));
  assert.equal(await page.locator('#finalistOrderRows li').count(),0,'MOC main and final remain separate');
  await page.locator('#comp').selectOption('KCAC');await page.locator('#finalistOrderRows li').first().waitFor();
  assert.equal(await page.locator('#finalistOrderRound option').count(),1);
  assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),scoresBefore);
 console.log('Stage232 reverse finalist numbering, editable stable-identity order, score/date/prelim preservation, stale edit guards and responsive admin flow passed.');
}finally{await qa.close();api.close();}
