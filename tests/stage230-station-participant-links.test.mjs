import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage230-qa',{recursive:true});
try{
 const {judges,lead}=await seedKcrStations(api);
 api.db.prepare("UPDATE participants SET final_cup_no='',name='예선 선수' WHERE competition_code='KCR' AND prelim_cup_no='1'").run();
 api.db.prepare("UPDATE participants SET final_cup_no='1',name='결선 선수' WHERE competition_code='KCR' AND prelim_cup_no='4'").run();
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
 for(const round of ['예선','결선']){
  const data=await api.rpc('getStationCupParticipants','KCR',round,api.actor);
  assert.equal(data.stations.length,2,'calibration-only station is not linked to official participants');
  assert.equal(data.stations[0].cups[0].participants[0].name,round==='예선'?'예선 선수':'결선 선수');
  assert.equal(data.stations[1].cups[1].status,round==='예선'?'linked':'unassigned');
 }
 for(const actor of [judges[0],judges[1],lead,{}]){
  const denied=await (await api.handle({action:'getStationCupParticipants',args:['KCR','예선',actor]})).json();
  assert.equal(denied.success,false);assert.doesNotMatch(JSON.stringify(denied),/예선 선수|결선 선수/);
 }
 api.db.prepare("UPDATE participants SET final_cup_no='1' WHERE competition_code='KCR' AND prelim_cup_no='3'").run();
 assert.equal((await api.rpc('getStationCupParticipants','KCR','결선',api.actor)).stations[0].cups[0].status,'duplicate');
 api.db.prepare("UPDATE participants SET final_cup_no='' WHERE competition_code='KCR' AND prelim_cup_no='3'").run();
 // Final roster numbers and sensory blind codes are separate. Only finalists
 // (or historically linked final records) enter the final blind-assignment editor.
 for(const [i,final] of [[1,'1'],[2,'']])await api.rpc('upsertParticipant',{competitionCode:'IKRC',name:'IKRC 선수'+i,uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:final,extra:{ikrcBlindAssignments:{예선:'P-'+i},roundSchedules:{예선:{date:'2026-08-12'}}}},api.actor);
 const ikrcStations=[{id:'final-a',label:'결선 스테이션',prefix:'Z',start:1,end:2,purpose:'competition'}];
 await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'결선',optionSettings:{ikrcStations:{byRound:{결선:ikrcStations},stations:ikrcStations}}},api.actor);
 const ikrc=await api.rpc('getIkrcBlindAssignments',api.actor);
 assert.equal(ikrc.participants.length,1);assert.equal(ikrc.participants[0].currentUnit,'');
 await api.rpc('saveIkrcBlindAssignments',{currentRound:'결선',assignments:[{participantId:ikrc.participants[0].participantId,unit:'Z-1'}]},api.actor);
 const linked=await api.rpc('getStationCupParticipants','IKRC','결선',api.actor);
 assert.equal(linked.stations[0].cups[0].participants[0].name,'IKRC 선수1');
 assert.equal(linked.stations[0].cups[1].status,'unassigned');
 const extras=api.db.prepare("SELECT extra_json FROM participants WHERE competition_code='IKRC' ORDER BY id").all().map(p=>JSON.parse(p.extra_json));
 assert.equal(extras[0].ikrcBlindAssignments.예선,'P-1');assert.equal(extras[1].ikrcBlindAssignments.예선,'P-2');
 assert.equal(extras[1].ikrcBlindAssignments.결선,undefined);
 // Display policy is competition-specific, not a global hide-all-names rule.
 for(const [i,code] of ['MOC','MOB','KBC','KTCC','KCAC','IKRC'].entries()){
  if(code!=='IKRC')await api.rpc('upsertParticipant',{competitionCode:code,name:'공개구분선수',teamName:code==='KTCC'?'공개구분팀':'',affiliation:'공개구분소속',uniqueNo:'200',prelimCupNo:'200',finalCupNo:'200'},api.actor);
  await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:code+' 헤드',phone:'0108765000'+i,access:code,role:'센서리 헤드 심사위원'},api.actor);
  const judge=await api.rpc('judgeLogin',code+' 헤드','0108765000'+i);
  const response=await api.rpc('getParticipantAssignments',code,judge);
  if(['IKRC','KCAC'].includes(code))assert.ok(response.assignments.every(p=>!p.name&&!p.affiliation));
  else {assert.equal(response.assignments[0].number,'200');assert.match(response.assignments[0].display,/공개구분/);}
 }
 for(const width of [360,768,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
  const configs=(await api.rpc('getConfig')).configs;
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_adminConsole.configs=configs;showPanel('pAdmin');adminSwitchSection('config');adminRenderConfigList_();},{actor:api.actor,configs});
  const box=page.locator('#admin-config-card-KCR .station-cup-identities');
  await box.locator('summary').click();await box.locator('[data-cup-load]').click();
  await box.locator('[data-cup-station]').waitFor();assert.match(await box.innerText(),/예선 선수/);
  await page.locator('#admin-cfg-round-KCR').selectOption('결선');
  assert.equal(await box.locator('[data-cup-result]').innerText(),'');
  await box.locator('[data-cup-load]').click();await box.locator('[data-cup-station]').waitFor();
  assert.match(await box.innerText(),/결선 선수/);assert.doesNotMatch(await box.innerText(),/예선 선수/);
  await box.locator('[data-cup-station]').selectOption('stable-c');assert.match(await box.innerText(),/선수 미연결/);
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.screenshot({path:`tmp/stage230-qa/links-${width}.png`});
  await page.evaluate(judge=>{_judge=judge;adminRenderConfigList_();},judges[0]);
  assert.equal(await page.locator('.station-cup-identities').count(),0);
  assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),before);
 console.log('Stage230 admin station identity, exact-round links, duplicate/missing diagnostics, finalist scope, competition visibility and responsive UI passed.');
}finally{await qa.close();api.close();}
