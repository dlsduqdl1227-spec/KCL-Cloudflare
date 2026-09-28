import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
import {buildKcrNineCupPlan} from '../maintenance/kcr-nine-cup-plan.mjs';
const api=await createRpcFixture();
let qa;
try {
  const {judges}=await seedKcrStations(api);
  for(let i=5;i<=226;i++)await api.rpc('upsertParticipant',{competitionCode:'KCR',name:'비공개 QA '+i,uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:i<=40?String(i):''},api.actor);
  const calibration={id:'station3',prefix:'A',start:1,end:7,process:'Blending',prelimDay:1,useForCalibration:true,useForCompetition:false};
  const original=[calibration,...Array.from({length:32},(_,i)=>{
    const day=i<16?1:2,within=i%16;
    return {id:'station'+(i+4),prefix:'P'+i,start:(day-1)*113+within*7+1,end:(day-1)*113+(within===15?113:(within+1)*7),process:'Blending',prelimDay:day,useForCalibration:false,useForCompetition:true};
  })];
  const initial={kcrProcesses:{washed:false,natural:false,blending:true},unrelated:'preserve',kcrStations:{stations:original,byRound:{예선:original,결선:[{id:'final-old',prefix:'F',start:1,end:10,process:'Blending',useForCalibration:true,useForCompetition:true}]}}};
  const save=(options,round='예선')=>api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:round,isActive:true,debriefing:false,optionSettings:options},api.actor);
  await save(initial);
  await api.rpc('submitScores',stationSubmission(judges[0],{...original[1],label:'스테이션 2'},21));
  await api.rpc('submitScores',stationSubmission(judges[0],{...calibration,label:'스테이션 1'},7,true));
  const preserved=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const others=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY id").all());
  const plan=buildKcrNineCupPlan(initial);
  assert.deepEqual(initial.kcrStations.stations,original,'builder must not mutate its source');
  assert.equal(plan.unrelated,'preserve');
  const prelim=plan.kcrStations.byRound.예선,final=plan.kcrStations.byRound.결선;
  assert.equal(prelim.length,27);
  assert.deepEqual(prelim.slice(0,2).map(s=>[s.label,s.start,s.end]),[['스테이션 1',1,9],['스테이션 2',10,18]]);
  assert.deepEqual(prelim.filter(s=>s.useForCompetition).flatMap(s=>Array.from({length:s.end-s.start+1},(_,i)=>s.start+i)),Array.from({length:226},(_,i)=>i+1));
  assert.deepEqual(prelim.filter(s=>s.useForCompetition&&s.prelimDay===1).map(s=>s.end-s.start+1),[...Array(12).fill(9),5]);
  assert.deepEqual(prelim.filter(s=>s.useForCompetition&&s.prelimDay===2).map(s=>s.end-s.start+1),[...Array(12).fill(9),5]);
  assert.deepEqual(final.map(s=>s.end-s.start+1),[9,9,9,9,4]);
  assert.equal(prelim.at(-1).id,calibration.id);
  await save(plan);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),preserved);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY id").all()),others);
  const official=await api.rpc('getKcrStationEvaluationState',judges[1]);
  assert.equal(official.configs.find(c=>c.code==='KCR').optionSettings.kcrStations.stations[0].end,9);
  qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage227-qa',{recursive:true});
  for(const width of [390,1440]) {
    await save(plan);
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;_adminPreferredSection='config';loadAdminPanel();},api.actor);
    const panel=page.locator('#admin-config-card-KCR [data-kcr-station-manager]');await panel.waitFor();
    const row=panel.locator('[data-station-id="station4"]');
    assert.equal(await row.locator('[data-field=end]').inputValue(),'9');
    await row.locator('[data-field=end]').fill('8');
    const saving=page.waitForResponse(r=>r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
    await page.locator('#admin-config-card-KCR [data-save=KCR]').click();assert.equal((await (await saving).json()).success,true);
    await page.waitForFunction(()=>_configs.find(c=>c.code==='KCR').optionSettings.kcrStations.stations[0].end===8);
    const saved=JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings);
    assert.equal(saved.kcrStations.byRound.예선[0].end,8,'manual override survives save/reload');
    assert.deepEqual(saved.kcrStations.byRound.결선.map(s=>[s.start,s.end]),final.map(s=>[s.start,s.end]));
    // A calibration range cannot dictate the next official participant number.
    await panel.locator('[data-station-id="station3"] [data-field=end]').fill('900');
    await panel.locator('.ikrc-station-add').click();
    const added=panel.locator('[data-ikrc-station-row]').last();
    assert.equal(await added.locator('[data-field=start]').inputValue(),'227');
    assert.equal(await added.locator('[data-field=end]').inputValue(),'235');
    assert.equal(await added.locator('[data-field=process]').inputValue(),'Blending');
    await save(plan);
    const configs=(await api.rpc('getConfig')).configs;
    await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor:judges[1],configs});
    await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken && registeredTargetsForRange_('KCR',['1','9']).validated);
    const first=page.locator('#kcr-station-grid [data-station-id="station4"]');
    await first.waitFor();assert.match(await first.innerText(),/9명|0\/9/);
    await first.click();await page.locator('#evalCupping').waitFor({state:'visible'});
    assert.deepEqual(await page.evaluate(()=>_cupping.cups.map(c=>String(c.cupNumber))),Array.from({length:9},(_,i)=>String(i+1)));
    const restored=await page.evaluate(()=>{
      const old=JSON.parse(JSON.stringify(_cupping));
      old.station.end=7;old.cups=old.cups.slice(0,7);old.currentIdx=0;
      old.cups[0].flavor=2.4;old.cups[0].flavorIntensity=6;old.cups[0].flavorLocked=true;
      old.cups[0].sensoryComments.flavor.customComment='복원할 첫 컵 코멘트';
      old.cups[0].sensoryComments.flavor.commentTouched=true;
      const draft={updatedAt:new Date().toISOString(),state:{cupping:old},form:{'cupping-score-slider':{value:'4.8'}}};
      kclRestoreDraftForCode_('KCR',draft);
      return {numbers:_cupping.cups.map(c=>String(c.cupNumber)),end:_cupping.station.end,
        first:_cupping.cups[0].flavor,last:_cupping.cups[8].flavor,intensity:_cupping.cups[0].flavorIntensity,
        locked:document.getElementById('cupping-score-slider').disabled,
        slider:document.getElementById('cupping-score-slider').value,
        comment:document.getElementById('kcr-sensory-comment-flavor').value,
        backups:Object.keys(localStorage).filter(k=>k.includes('::station-range-backup::')).length};
    });
    assert.deepEqual(restored,{numbers:Array.from({length:9},(_,i)=>String(i+1)),end:9,first:2.4,last:3,intensity:6,locked:true,slider:'2.4',comment:'복원할 첫 컵 코멘트',backups:1});
    // A moved range must match by participant number, never by array position.
    const moved=await page.evaluate(()=>{
      const old=JSON.parse(JSON.stringify(_cupping));old.currentIdx=0;
      _cupping.cups=Array.from({length:9},(_,i)=>makeCupData(i+8));_cupping.station={..._cupping.station,start:8,end:16};
      old.cups[7].flavor=3.8;old.cups[7].noteOverall='8번 컵의 직접 작성 기록';
      kclRestoreDraftForCode_('KCR',{state:{cupping:old},form:{'cupping-score-slider':{value:'2.4'}}});
      const result={firstNumber:_cupping.cups[0].cupNumber,firstScore:_cupping.cups[0].flavor,lastScore:_cupping.cups[8].flavor,slider:document.getElementById('cupping-score-slider').value};
      return result;
    });
    assert.deepEqual(moved,{firstNumber:'8',firstScore:3.8,lastScore:3,slider:'3.8'});
    await page.evaluate(station=>{initCuppingEval(Array.from({length:9},(_,i)=>String(i+1)),'예선평가','Blending',false,false,station);},prelim[0]);
    await page.evaluate(()=>{_cupping.cups[0].flavor=2.4;_cupping.cups[0].noteOverall='첫 컵 독립 코멘트';_cupping.cups[8].flavor=4.2;_cupping.cups[8].noteOverall='아홉 번째 컵 독립 코멘트';});
    assert.deepEqual(await page.evaluate(()=>[_cupping.cups[0].flavor,_cupping.cups[8].flavor]),[2.4,4.2]);
    const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);
    await page.screenshot({path:`tmp/stage227-qa/nine-cups-${width}.png`});
    assert.deepEqual(page.qaErrors,[]);await page.close();
  }
  // A real server submission stores all nine separately, and cannot duplicate.
  await save(plan);
  await api.rpc('submitScores',stationSubmission(judges[1],prelim[0],28));
  const nine=api.db.prepare("SELECT unit FROM scores WHERE competition_code='KCR' AND judge_name=? ORDER BY CAST(unit AS INTEGER)").all(judges[1].name);
  assert.deepEqual(nine.map(r=>r.unit),Array.from({length:9},(_,i)=>String(i+1)));
  const rank=await api.rpc('getRanking','KCR',api.actor,'예선');assert.equal(rank.ranking.length,9);
  assert.equal((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking.length,0);
  await save(plan,'결선');
  await api.rpc('submitScores',{...stationSubmission(judges[1],final[0],35),round:'결선'});
  assert.equal((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking.length,9);
  assert.equal((await api.rpc('getRanking','KCR',api.actor,'예선')).ranking.length,9);
  console.log('Stage227: 226/40 coverage, nine-cup evaluation/save, manual overrides, day/round/calibration isolation, retained records and 390/1440 UI passed.');
} finally {if(qa)await qa.close();api.close();}
