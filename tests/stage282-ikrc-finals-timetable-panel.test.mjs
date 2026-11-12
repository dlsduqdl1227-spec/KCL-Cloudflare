import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';
import {ikrcFinalTimetable} from './fixtures/ikrc-timetable-20261106.mjs';

const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle}),out='tmp/stage282-qa';fs.mkdirSync(out,{recursive:true});
const raw=async(action,...args)=>(await api.handle({action,args})).json();
try{
 const {participants,judges,stations}=await seedIkrcFinal(api),config=api.db.prepare("SELECT * FROM competitions WHERE code='IKRC'").get();
 const roastOrder=ikrcFinalTimetable.map(p=>p.name),seedOrder=ikrcFinalTimetable.slice().sort((a,b)=>a.schedule.seedToCup.order-b.schedule.seedToCup.order).map(p=>p.name);
 for(const [i,p]of participants.entries()){const extra=JSON.parse(p.extra_json);extra.roundSchedules.결선={...extra.roundSchedules.결선,...ikrcFinalTimetable[i].schedule};api.db.prepare('UPDATE participants SET name=?,extra_json=? WHERE id=?').run(roastOrder[i],JSON.stringify(extra),p.id);}
 const beforeConfig=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
 let consoleData=await api.rpc('getIkrcSeedToCupConsole',api.actor);assert.deepEqual(consoleData.finalists.map(p=>p.playerName),seedOrder);assert.ok(consoleData.finalists.every(p=>p.roastingSchedule.date==='2026-11-11'&&p.seedSchedule.date==='2026-11-12'));
 assert.equal((await raw('getIkrcSeedToCupConsole',judges[0])).success,false);
 const blind=await api.rpc('getParticipantAssignments','IKRC',judges[0]);assert.ok(blind.assignments.every(p=>p.identityHidden&&!p.name&&!p.seedSchedule));assert.doesNotMatch(JSON.stringify(blind),/채협정|김태민|13:50/);
 // A head can evaluate both stations, but cannot create a ranking alone.
 for(const station of stations)await api.rpc('submitScores',ikrcFinalSubmission(judges[0],station,10));
 assert.equal((await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.length,0);
 const headOnlyDetail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(headOnlyDetail.totalScore,0);assert.equal(headOnlyDetail.avgScore,0);assert.equal(headOnlyDetail.rows.length,0);assert.equal(headOnlyDetail.comparisonRows.length,1);
 await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id),expectedSavedAt:''},3,'결선 결과',api.actor);
 for(let i=1;i<judges.length;i++)for(const station of stations)await api.rpc('submitScores',ikrcFinalSubmission(judges[i],station,6+i/10));
 let ranking=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;assert.equal(ranking.length,12);assert.ok(ranking.every(r=>r.roastingScore===63&&r.confirmedJudgeCount===5&&r.headCount===1&&r.sensoryCount===5));assert.equal(ranking.find(r=>r.unit==='A-1').rankingScore,66);
 const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,63);assert.equal(detail.totalScore,66);assert.equal(detail.rows.length,5);assert.equal(detail.comparisonRows.length,1);
 const comparison=await api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',{scope:'station',stationId:stations[0].id},judges[0]);assert.equal(comparison.headCount,1);assert.equal(comparison.judgeCount,5);assert.equal(comparison.rows.length,6);assert.equal(comparison.finalAverage,63);assert.equal(comparison.headScoreIncluded,false);
 for(let i=0;i<judges.length;i++)await api.rpc('submitScores',ikrcFinalSubmission(judges[i],stations[0],i?4:9,'IKRC 스테이션 켈리브레이션'));
 const calibration=await raw('getIkrcCalibrationResultsByCup','A-1',{scope:'station',stationId:stations[0].id},judges[0]);assert.equal(calibration.length,6);assert.equal(calibration.filter(p=>p.isHeadCalibration).length,1);
 assert.equal((await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit==='A-1').rankingScore,66);
 const protectedScores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),protectedPlayers=api.db.prepare("SELECT * FROM participants WHERE competition_code='IKRC'").all();
 const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.scores.length,6);assert.equal(preview.rankInfo.avgScore,63);assert.equal(preview.rankInfo.rankingScore,66);assert.equal(preview.scores.find(s=>/헤드/.test(s['역할']))['총점'],100);
 const report=await api.rpc('getFinalReport','IKRC',api.actor,'결선');assert.equal(report.ranking.find(r=>r.unit==='A-1').roastingScore,63);assert.equal(report.ranking.find(r=>r.unit==='A-1').rankingScore,66);
 api.db.prepare("UPDATE competitions SET debriefing=1 WHERE code='IKRC'").run();
 api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run('IKRC',roastOrder[0],participants[0].phone,'282282','2099-01-01T00:00:00Z');
 const athlete=await api.rpc('verifyOTP',roastOrder[0],participants[0].phone,'IKRC','282282','결선');assert.deepEqual(athlete.scores,preview.scores);assert.deepEqual(athlete.rankInfos,preview.rankInfos);
 api.db.prepare("UPDATE competitions SET debriefing=0 WHERE code='IKRC'").run();
 const publicPage=await qa.page(390,950);await publicPage.goto(qa.origin+'/debriefing/');await publicPage.waitForFunction(()=>_configs.length>0);await publicPage.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);
 assert.match(await publicPage.locator('.avg-box').innerText(),/IKRC 센서리 평균[\s\S]*63[\s\S]*315.*÷ 5명/);assert.match(await publicPage.locator('#res-body').innerText(),/헤드심사위원 평가 · 비교용/);
 assert.equal(await publicPage.locator('.score-card').count(),6);
 const previewMarkup=await publicPage.locator('#res-body').innerHTML();await publicPage.evaluate(res=>renderResult(res),athlete);assert.equal(await publicPage.locator('#res-body').innerHTML(),previewMarkup);
 await publicPage.locator('.avg-box').screenshot({path:out+'/sensory-only-average.png'});
 const comparisonPage=await qa.page(390,950);await comparisonPage.goto(qa.origin+'/assessment/');await comparisonPage.evaluate(({actor,detail})=>{_judge=actor;_selComp={code:'IKRC',currentRound:'결선'};document.getElementById('ikrc-cal-detail').innerHTML=buildIkrcCalibrationHtml_('A-1',detail);showPanel('pIkrcCalDetail');},{actor:judges[0],detail:comparison});assert.match(await comparisonPage.locator('#ikrc-cal-detail').innerText(),/순위 반영 센서리 평균\s*63[\s\S]*헤드·센서리 전체 평균 ± 표준편차[\s\S]*69\.17/);await comparisonPage.screenshot({path:out+'/six-judge-comparison.png'});
 const seedPage=await qa.page();await seedPage.goto(qa.origin+'/assessment/');await seedPage.evaluate(a=>{_judge=a;_selComp={code:'IKRC',currentRound:'결선'};openIkrcSeedToCup_(_selComp);},api.actor);await seedPage.locator('#ikrc-seed-list .review-item').nth(11).waitFor();
 const headPage=await qa.page();await headPage.goto(qa.origin+'/assessment/');
 const finalConfig=(await api.rpc('getConfig')).configs.find(c=>c.code==='IKRC');
 await headPage.evaluate(({actor,config})=>{_judge=actor;_selComp=config;goEval();},{actor:judges[0],config:finalConfig});
 assert.match(await headPage.locator('#ikrcCalibrationNotice').innerText(),/헤드 점수는 비교.*센서리 평균/);
 await headPage.locator('#ikrc-station-grid button').first().click();
 assert.match(await headPage.locator('#ikrc-sub').innerText(),/헤드 비교용 · 순위 제외/);
 assert.deepEqual(headPage.qaErrors,[]);await headPage.close();
 assert.deepEqual((await seedPage.locator('#ikrc-seed-list .review-info-name').allTextContents()).map(s=>s.split(' · ')[0]),seedOrder);assert.match(await seedPage.locator('#ikrc-seed-list .review-item').first().innerText(),/김기출[\s\S]*2026-11-12[\s\S]*13:50~14:15/);
 await seedPage.locator('#ikrc-final-timetable').evaluate(e=>e.open=true);assert.equal(await seedPage.locator('.ikrc-timetable-list li').count(),24);
 const registry=await qa.page();await registry.goto(qa.origin+'/registry/');await registry.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);await registry.locator('#comp option[value=IKRC]').waitFor({state:'attached'});await registry.locator('#comp').selectOption('IKRC');await registry.waitForFunction(()=>participantRows[0]?.competitionCode==='IKRC');await registry.locator('[data-roster-phase=finals]').click();
 assert.match(await registry.title(),/등록·데이터 관리/);assert.match(await registry.locator('#partTable').innerText(),/2026-11-11[\s\S]*Seed to Cup[\s\S]*2026-11-12/);
 await registry.locator('#partTable tr').filter({hasText:'채협정'}).locator('[data-edit-part]').click();await registry.locator('#ikrc-schedule-seed-date').waitFor({state:'visible'});assert.equal(await registry.locator('#mFinalDate').inputValue(),'2026-11-11');assert.equal(await registry.locator('#ikrc-schedule-seed-date').inputValue(),'2026-11-12');
 await registry.locator('#ikrc-schedule-seed-performanceTime').fill('14:16~14:41');await registry.locator('#participantSaveBtn').click();await registry.waitForFunction(()=>!document.getElementById('registry-editor-dialog').open);
 const edited=api.db.prepare('SELECT * FROM participants WHERE id=?').get(participants[0].id),original=protectedPlayers.find(p=>p.id===edited.id),extra=JSON.parse(edited.extra_json);assert.equal(extra.roundSchedules.결선.seedToCup.performanceTime,'14:16~14:41');assert.equal(extra.roundSchedules.결선.performanceTime,'14:00~14:25');assert.deepEqual(extra.ikrcBlindAssignments,JSON.parse(original.extra_json).ikrcBlindAssignments);
 for(const key of ['phone','unique_no','prelim_cup_no','final_cup_no','sample_no'])assert.equal(edited[key],original[key]);
 await registry.locator('#partTable tr').filter({hasText:'채협정'}).locator('[data-edit-part]').click();assert.equal(await registry.locator('#ikrc-schedule-seed-performanceTime').inputValue(),'14:16~14:41');
 for(const width of [360,768,1440])for(const [label,page]of [['seed',seedPage],['registry',registry],['debrief',publicPage],['comparison',comparisonPage]]){await page.setViewportSize({width,height:950});assert.equal((await inspectPage(page)).pageOverflow,false,label+width);assert.deepEqual(await auditTextContrast(page),[],label+width);assert.deepEqual(page.qaErrors,[]);await page.screenshot({path:out+'/'+label+'-'+width+'.png'});}
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),protectedScores);assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),beforeConfig);assert.deepEqual(api.db.prepare("SELECT option_settings FROM competitions WHERE code='IKRC'").get().option_settings,config.option_settings);
 console.log('Stage282: supplied dual timetables, independent editable dates/stations/order, unchanged blind codes and original records; shared A/B head+5, six-person comparison/calibration, sensory-only final mean and Seed bonus, six debrief cards, registry menu and 360/768/1440px passed.');
}finally{await qa.close();api.close();}
