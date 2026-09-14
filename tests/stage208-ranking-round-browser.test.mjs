import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedRoundRankings,competitionCodes,roundsFor} from './helpers/round-ranking-fixture.mjs';

const api=await createRpcFixture();const qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/ranking-round-qa',{recursive:true});
async function waitRanking(page,code,round){
  await page.waitForFunction(({code,round})=>_ranking?.compCode===code&&_ranking.selectedRound===round&&document.getElementById('rank-summary-sub').textContent.includes('총 '),{code,round});
}
try {
  await seedRoundRankings(api);
  await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:'라운드 QA 팀장',phone:'01099887766',access:competitionCodes.join(','),role:'대회팀장'},api.actor);
  const lead=await api.rpc('judgeLogin','라운드 QA 팀장','01099887766');
  const original=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const configOriginal=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
  for(const width of [360,768,1440]){
    const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
    await page.waitForSelector('#admin-comp-list [data-act=rank]');
    for(const code of competitionCodes){
      await page.evaluate(()=>{showPanel('pAdmin');adminSwitchSection('run');});
      const index=await page.evaluate(code=>_adminConsole.configs.findIndex(c=>c.code===code),code);
      await page.locator('#admin-comp-list .admin-comp-card').nth(index).locator('[data-act=rank]').click();
      await waitRanking(page,code,'결선');
      assert.equal(await page.locator('#ranking-round-select').inputValue(),'결선');
      for(const round of roundsFor(code)){
        await page.locator('#ranking-round-select').selectOption(round);
        await waitRanking(page,code,round);
        assert.equal(await page.locator('.rank-round-section').count(),1);
        assert.match(await page.locator('.rank-round-title').innerText(),new RegExp('^'+round));
        await page.locator('.rank-row').first().click();
        await page.waitForFunction(round=>_rankingDetail?.round===round&&document.getElementById('ranking-detail-body').textContent.includes('독립 기록'),round);
        const detail=await page.locator('#ranking-detail-body').innerText();
        assert.ok(detail.includes(code+' '+round+' 독립 기록'));
        for(const other of roundsFor(code).filter(r=>r!==round))assert.ok(!detail.includes(code+' '+other+' 독립 기록'));
        await page.locator('#pRankingDetail').getByRole('button',{name:'순위로 돌아가기'}).click();
        const refreshed=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getRanking');
        await page.getByRole('button',{name:'선택한 라운드 순위 새로고침'}).click();
        assert.equal((await refreshed).request().postDataJSON().args[2],round);
        await waitRanking(page,code,round);
        assert.equal((await inspectPage(page)).pageOverflow,false,code+' '+width+'px');
      }
    }
    // Export uses the chosen stage; opening/reading ranks never changes live settings.
    await page.evaluate(()=>{ensureXlsxLib_=cb=>cb(false);fallbackFinalReportXls_=res=>{window.qaReport=res;};downloadFinalReportExcel();});
    await page.waitForFunction(()=>window.qaReport?.selectedRound==='결선');
    assert.deepEqual(await page.evaluate(()=>qaReport.rounds),['결선']);
    assert.equal(await page.evaluate(()=>qaReport.rawRows.every(r=>r.round==='결선')),true);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.ranking-round-controls').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    await page.screenshot({path:'tmp/ranking-round-qa/ranking-'+width+'.png'});
    // Actual team-lead session, all seven cards including IKRC must bind cleanly.
    await page.evaluate(actor=>{_judge=actor;loadTeamPanel();},lead);
    await page.waitForSelector('#team-comp-list [data-act=rank]');
    assert.equal(await page.locator('#team-comp-list [data-act=rank]').count(),7);
    for(const code of competitionCodes){
      await page.evaluate(()=>showPanel('pTeam'));
      const index=await page.evaluate(code=>filterConfigsByAccessAll_(_configs).findIndex(c=>c.code===code),code);
      await page.locator('#team-comp-list .admin-comp-card').nth(index).locator('[data-act=rank]').click();
      await waitRanking(page,code,'결선');
      assert.equal(await page.locator('.rank-round-section').count(),1);
    }
    assert.deepEqual(page.qaErrors,[]);
    await page.close();
    console.log('Stage208 actual admin/team ranking, detail, refresh, report and print controls passed at '+width+'px.');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original,'browsing must not change stored evaluations');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),configOriginal,'ranking selection must not change operating rounds or public settings');
  // Delayed, failed and old-server responses must never reuse another stage.
  const page=await qa.page(390);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{
    _judge=actor;window.qaRequests=[];
    window.google={script:{get run(){const call={};return {
      withSuccessHandler(fn){call.ok=fn;return this;},withFailureHandler(fn){call.fail=fn;return this;},
      getRanking(code,actor,round){call.code=code;call.round=round;qaRequests.push(call);},
      getRankingDetail(code,unit,round){call.code=code;call.round=round;call.detail=true;qaRequests.push(call);}
    };}}};
    const item=round=>({round,rank:1,unit:'1',score:20,totalScore:20,playerNameSummary:round+' 선수',totalCount:1,reviewedCount:1});
    window.qaReply=round=>({success:true,compCode:'KBC',selectedRound:round,ranking:[item(round)]});
    goRankingByCode('KBC','KBC','예선');qaRequests[0].ok(qaReply('예선'));
    goRankingByCode('KBC','KBC','결선');
  },api.actor);
  assert.equal(await page.locator('.rank-row').count(),0,'do not flash cached preliminary ranks on final entry');
  assert.equal(await page.evaluate(()=>_ranking),null,'stale data must not be printable');
  await page.evaluate(()=>qaRequests[1].fail(new Error('QA offline')));
  assert.equal(await page.locator('.rank-row').count(),0,'failed final query does not fall back to preliminary');
  await page.evaluate(()=>{goRankingByCode('KBC','KBC','본선');goRankingByCode('KBC','KBC','결선');qaRequests[3].ok({...qaReply('결선'),ranking:[]});qaRequests[2].ok(qaReply('본선'));});
  assert.match(await page.locator('#ranking-list').innerText(),/결선에 아직 집계된 평가가 없습니다/);
  await page.evaluate(()=>{goRankingByCode('KBC','KBC','예선');qaRequests[4].ok({...qaReply('예선'),selectedRound:undefined,ranking:qaReply('예선').ranking.concat(qaReply('결선').ranking)});});
  assert.equal(await page.locator('.rank-round-section').count(),1,'legacy all-round API response is filtered defensively');
  await page.locator('.rank-row').click();
  await page.evaluate(()=>{backToRanking();goRankingByCode('KBC','KBC','결선');qaRequests[6].ok({...qaReply('결선'),ranking:[]});qaRequests[5].ok({success:true,round:'예선',rows:[{총점:99}]});});
  assert.equal(await page.evaluate(()=>_rankingDetail),null,'late detail cannot overwrite the newly selected round');
  assert.deepEqual(page.qaErrors,[]);await page.close();
  console.log('Stage208 empty finals, offline/cache isolation, old API compatibility and late-response guards passed.');
} finally {await qa.close();api.close();}
