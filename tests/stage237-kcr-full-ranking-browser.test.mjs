import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';

// All submissions and edits here use disposable SQLite, never the live competition.
const api=await createRpcFixture();
const qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage237-qa',{recursive:true});
try {
  const {judges,lead}=await seedKcrStations(api);
  for(let i=5;i<=226;i++)await api.rpc('upsertParticipant',{
    competitionCode:'KCR',name:'KCR QA '+i,uniqueNo:String(i),prelimCupNo:String(i)
  },api.actor);
  const stations=Array.from({length:26},(_,i)=>({
    id:'full-'+i,label:'스테이션 '+(i+1),start:i*9+1,end:Math.min(226,i*9+9),
    process:'Blending',useForCompetition:true,useForCalibration:true
  }));
  await api.rpc('updateCompetitionAdminSettings',{
    code:'KCR',currentRound:'예선',isActive:true,debriefing:false,
    optionSettings:{kcrProcesses:{blending:true},kcrStations:{byRound:{예선:stations},stations}}
  },api.actor);
  for(const station of stations){
    const payload=stationSubmission(judges[0],station,28);
    payload.rows.forEach(row=>{
      const score=35-Number(row.data[0])*0.05;
      Object.assign(row.extraFields,{총점:score,'Flavor(플레이버)':score/7,종합코멘트:'참가자 '+row.data[0]+' 보존 코멘트'});
    });
    await api.rpc('submitScores',payload);
  }
  await api.rpc('submitScores',stationSubmission(judges[0],stations[0],35,true));
  const ranked=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.equal(ranked.ranking.length,226,'API already contains all official participants');
  assert.equal(ranked.ranking[40].rank,41);
  assert.equal(ranked.ranking[225].rank,226);
  const stored=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const configs=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
  const participants=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
  for(const width of [360,768,1440]){
    const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    for(const actor of [api.actor,lead]){
      await page.evaluate(actor=>{_judge=actor;goRankingByCode('KCR','KCR','예선');},actor);
      await page.waitForFunction(()=>document.querySelectorAll('#ranking-list .rank-row').length===226);
      assert.match(await page.locator('#ranking-title').innerText(),/전체 순위/);
      assert.match(await page.locator('#rank-summary-sub').innerText(),/총 226개 항목 · 전체 순위 표시/);
      assert.equal(await page.locator('.rank-round-title').innerText(),'예선 (226개)');
      assert.equal((await inspectPage(page)).pageOverflow,false,'no overflow at '+width);
      for(const position of [40,225]){
        const item=ranked.ranking[position];
        await page.locator('#ranking-list .rank-row').nth(position).click();
        await page.waitForFunction(unit=>_rankingDetail?.unit===unit&&document.getElementById('ranking-detail-body').textContent.includes('보존 코멘트'),item.unit);
        assert.match(await page.locator('#ranking-detail-body').innerText(),new RegExp('참가자 '+item.unit+' 보존 코멘트'));
        await page.locator('#pRankingDetail').getByRole('button',{name:'순위로 돌아가기'}).click();
      }
      const refresh=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getRanking');
      await page.getByRole('button',{name:'선택한 라운드 순위 새로고침'}).click();
      await refresh;
      await page.waitForFunction(()=>document.querySelectorAll('#ranking-list .rank-row').length===226);
      assert.equal(await page.evaluate(()=>_ranking.ranking.length),226);
      await page.evaluate(()=>{window.print=()=>{window.qaPrinted=true;};});
      await page.locator('#ranking-pdf-button').click();
      await page.waitForFunction(()=>window.qaPrinted===true);
      assert.equal(await page.locator('#ranking-list .rank-row:visible').count(),226,'PDF does not remove screen rows');
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('#ranking-list .rank-row:visible').count(),40,'preserve Top40 PDF');
      await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
      await page.emulateMedia({media:'screen'});
      assert.equal(await page.locator('#ranking-list .rank-row:visible').count(),226,'restore full ranking after print');
      assert.equal(await page.locator('#rank-summary-title').innerText(),'전체 순위표');
      assert.equal(await page.locator('.kcr-print-hidden').count(),0);
      await page.locator('#ranking-round-select').selectOption('결선');
      await page.waitForFunction(()=>_ranking?.selectedRound==='결선');
      assert.equal(await page.locator('#ranking-list .rank-row').count(),0,'preliminary rows never appear in empty finals');
    }
    await page.evaluate(()=>goRankingByCode('KCR','KCR','예선'));
    await page.waitForFunction(()=>document.querySelectorAll('#ranking-list .rank-row').length===226);
    await page.locator('#ranking-list .rank-row').nth(40).scrollIntoViewIfNeeded();
    await page.screenshot({path:'tmp/stage237-qa/ranks-after-40-'+width+'.png'});
    assert.deepEqual(page.qaErrors,[]);
    await page.close();
    console.log('Stage237 full KCR ranking, ranks 41/226 details, refresh, PDF and round isolation passed at '+width+'px.');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),stored,'scores, tags, comments and locks are unchanged');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),configs);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),participants);
} finally {await qa.close();api.close();}
