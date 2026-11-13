import test from 'node:test';
import assert from 'node:assert/strict';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage,selectOperationsCompetition} from './helpers/browser-fixture.mjs';

test('admin and KBC team lead click an actual ranking row and see presentation scores, comments and tags in all rounds on mobile and desktop',async()=>{
  const api=await createAllDebriefFixture();const qa=await createBrowserFixture({apiHandler:api.handle});try{
    const c=api.cases.find(c=>c.code==='KBC'),headers=['Service Professionalism(서비스의 전문성)','Presentation','Service Professionalism'];
    for(const row of api.db.prepare("SELECT id,round,payload_json FROM scores WHERE competition_code='KBC'").all()){
      const payload=JSON.parse(row.payload_json),index=c.rounds.indexOf(row.round),h=headers[index];
      Object.assign(payload.rows[0].extraFields,{[h]:index===2?0:4.2,[h+' 코멘트']:row.round+' 프레젠테이션 원문 의견',[h+' 스마트태그']:row.round+' 의도 전달 명확'});
      api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
    }
    // Reuse the existing disposable SQLite fixture identity; no real account or phone is introduced.
    const leadName=c.name+' 테스트 팀장',leadPhone=c.phone;
    await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:leadName,phone:leadPhone,access:'KBC',role:'대회팀장'},api.actor);
    const lead=await api.rpc('judgeLogin',leadName,leadPhone);
    const snapshot=()=>JSON.stringify(['scores','participants','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
    const before=snapshot();
    for(const [isAdmin,actor] of [[true,api.actor],[false,lead]])for(const width of [390,1440]){
      const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
      await page.evaluate(({actor,isAdmin})=>{_judge=actor;if(isAdmin)loadAdminPanel();else loadTeamPanel();},{actor,isAdmin});
      if(isAdmin){await selectOperationsCompetition(page,'KBC');await page.locator('#admin-comp-list [data-workspace-competition=KBC] [data-act=rank]').click();}
      else await page.locator('#team-comp-list [data-act=rank]').click();
      for(const [index,round] of c.rounds.entries()){
        await page.locator('#ranking-round-select').selectOption(round);
        await page.waitForFunction(round=>_ranking?.compCode==='KBC'&&_ranking.selectedRound===round&&document.getElementById('rank-summary-sub').textContent.includes('총 '),round);
        const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getRankingDetail');
        await page.locator('.rank-row').first().click();
        const opened=await(await response).json();assert.equal(opened.success,true);assert.equal(opened.round,round);
        await page.waitForFunction(round=>_rankingDetail?.round===round&&document.getElementById('pRankingDetail').classList.contains('active'),round);
        const field=page.locator('#ranking-detail-body .detail-field').filter({hasText:'프레젠테이션·서비스 전문성'}).first();
        assert.equal(await field.isVisible(),true);assert.match(await field.innerText(),index===2?/0 \/ 5/:/4\.2 \/ 5/);
        const body=await page.locator('#ranking-detail-body').innerText();assert.ok(body.includes(round+' 프레젠테이션 원문 의견'));assert.ok(body.includes(round+' 의도 전달 명확'));
        for(const other of c.rounds.filter(r=>r!==round))assert.ok(!body.includes(other+' 프레젠테이션 원문 의견'));
        assert.equal((await inspectPage(page)).pageOverflow,false);
        await page.locator('#pRankingDetail').getByRole('button',{name:'순위로 돌아가기'}).click();
      }
      assert.deepEqual(page.qaErrors,[]);await page.close();
    }
    assert.equal(snapshot(),before,'ranking clicks never modify stored competition data');
  }finally{await qa.close();api.close();}
});
