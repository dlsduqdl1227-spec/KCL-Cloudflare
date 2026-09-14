import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMocDebriefFixture} from './helpers/moc-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const api=await createMocDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage218-qa',{recursive:true});
try{
  api.db.prepare("UPDATE competitions SET debriefing=1 WHERE code='MOC'").run();
  const player=await api.publicView();assert.equal(player.success,true);
  const preview=await api.rpc('getAdminDebriefPreview','MOC','177','예선',api.actor);
  const empty=await api.publicView(api.players[2]);
  for(const width of [390,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);
    const previewHtml=await page.locator('#res-body').innerHTML();
    const prelimOnly={...player,scores:player.scores.filter(s=>s.round==='예선'),rankInfos:player.rankInfos.filter(r=>r.round==='예선'),rankInfo:player.rankInfos.find(r=>r.round==='예선')};
    await page.evaluate(res=>renderResult(res),prelimOnly);
    assert.equal(await page.locator('#res-body').innerHTML(),previewHtml,'same-round player/preview output is identical');
    await page.evaluate(res=>renderResult(res),player);
    const rankText=await page.locator('.rank-box').innerText();
    for(const round of ['예선','본선','결선']){assert.ok(rankText.includes(round+' 순위'));assert.ok(rankText.includes(round+' 총점'));}
    assert.equal(await page.locator('.score-card').count(),3);
    assert.deepEqual(page.qaErrors,[]);assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:'tmp/stage218-qa/moc-'+width+'.png',fullPage:true});
    await page.evaluate(res=>renderResult(res),empty);assert.equal(await page.locator('.score-card').count(),0);
    assert.equal(await page.locator('.rank-box').count(),0);assert.match(await page.locator('#res-body').innerText(),/아직 공개된 검수 완료 평가가 없습니다/);
    await page.close();
  }
  console.log('Stage218 MOC public/preview identical markup, three round ranks, empty result, no JavaScript error/overflow at 390/768/1440px passed.');
}finally{await qa.close();api.close();}
