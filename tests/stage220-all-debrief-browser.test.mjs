import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage220-qa',{recursive:true});
try{
  api.db.prepare('UPDATE competitions SET debriefing=1').run();
  for(const c of api.cases){
    const res=await api.publicView(c);assert.equal(res.success,true);
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor);
    for(const width of [390,768,1440]){
      const page=await qa.page(width);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
      await page.evaluate(r=>{renderResult(r);showPanel('pResult');},preview);
      const html=await page.locator('#res-body').innerHTML();
      const firstRound={...res,scores:res.scores.filter(s=>s.round==='예선'),rankInfos:res.rankInfos.filter(r=>r.round==='예선'),rankInfo:res.rankInfos.find(r=>r.round==='예선')};
      await page.evaluate(r=>renderResult(r),firstRound);
      assert.equal(await page.locator('#res-body').innerHTML(),html,c.code+' exact public/preview markup');
      await page.evaluate(r=>renderResult(r),res);
      for(const round of c.rounds)assert.ok((await page.locator('.rank-box').innerText()).includes(round+' 순위'),c.code+' round '+round);
      const inspected=await inspectPage(page);assert.equal(inspected.pageOverflow,false,c.code+' width '+width);assert.deepEqual(inspected.brokenImages,[]);assert.deepEqual(page.qaErrors,[]);
      if(width===390)await page.screenshot({path:`tmp/stage220-qa/${c.code}.png`,fullPage:true});
      await page.close();
    }
    console.log(c.code+' 390/768/1440px debriefing parity and round labels passed');
  }
}finally{await qa.close();api.close();}
