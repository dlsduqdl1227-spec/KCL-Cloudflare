import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDebriefRoundFixture} from './helpers/debrief-round-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

test('KBC debrief labels show rank, not performance order; admin, lead and player open the same exact-round evaluations',async()=>{
  const api=await createDebriefRoundFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage310-qa',{recursive:true});
  try{
    const c=api.cases.find(c=>c.code==='KBC');
    const snapshot=()=>JSON.stringify(['scores','participants','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
    const before=snapshot(),auth=await api.publicView(c);
    const options=(await api.rpc('getAdminDebriefPreviewOptions','KBC',api.actor)).options;
    for(const [staff,actor]of [['admin',api.actor],['lead',api.previewLead]]){
      const page=await qa.page(390,900);
      await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),actor);
      await page.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=KBC');
      await page.waitForFunction(()=>_adminPreviewOptionsCode==='KBC'&&_adminPreviewOptions.length>0);
      for(const [index,round]of c.rounds.entries()){
        await page.setViewportSize({width:390,height:900});
        await page.locator('#sel-phase').selectOption(round);
        const selected=options.findIndex(item=>item.round===round&&item.unit===c.units[index]);
        assert.ok(selected>=0);
        const item=options[selected];
        assert.notEqual(String(item.rank),item.unit,'fixture rank differs from performance order');
        const label=await page.locator('#admin-preview-unit option').evaluateAll((nodes,value)=>nodes.find(n=>n.value===value)?.textContent,String(selected));
        assert.equal(label,[round,item.rank+'위',item.name,item.affiliation].filter(Boolean).join(' · '));
        await page.locator('#admin-preview-unit').selectOption(String(selected));
        if(staff==='admin'&&round==='결선')await page.screenshot({path:'tmp/stage310-qa/KBC-selector-390.png'});
        const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getAdminDebriefPreview');
        await page.locator('#admin-preview-open').click();
        const opened=await(await response).json();
        assert.equal(opened.success,true);assert.equal(opened.previewUnit,item.unit);assert.equal(opened.previewRound,round);
        assert.equal(opened.rankInfo.rank,item.rank,'hiding order never changes rank or record lookup');
        await page.waitForFunction(round=>document.getElementById('pResult').classList.contains('active')&&_lastResult.requestedPhase===round,round);
        const previewBody=await page.locator('#res-body').innerHTML();
        assert.equal(await page.locator('.score-card').count(),4);
        assert.equal(await page.locator('.rank-box .cell').first().locator('b').innerText(),String(item.rank)+' / '+item.totalInRound);
        const player=await api.rpc('getDebriefPhase',auth.debriefToken,round);
        await page.evaluate(res=>renderResult(res),player);
        assert.equal(await page.locator('#res-body').innerHTML(),previewBody,'public report matches staff preview');
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:900});
          const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
          assert.equal(await page.locator('#pResult').getByText(/시연\s*순서|경연\s*순서/).count(),0);
        }
        if(staff==='admin'&&round==='결선'){
          await page.setViewportSize({width:390,height:900});await page.screenshot({path:'tmp/stage310-qa/KBC-final-390.png'});
        }
        await page.evaluate(()=>backToStep1());
      }
      assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    }
    assert.equal(snapshot(),before,'debrief display changes do not mutate schedules, scores or comments');
  }finally{await qa.close();api.close();}
});
