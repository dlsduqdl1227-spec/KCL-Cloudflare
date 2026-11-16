import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKcacFinalPenaltyFixture} from './helpers/kcac-final-penalty-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

test('KCAC final displays gross judge subtotals and one event-wide time penalty while the official score stays 126',async()=>{
  const api=await createKcacFinalPenaltyFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage315-qa',{recursive:true});
  try{
    const before=api.snapshot(),preview=await api.rpc('getAdminDebriefPreview','KCAC','1','결선',api.actor);
    const page=await qa.page(390,1000);await page.goto(qa.origin+'/debriefing/');
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);
    assert.equal(await page.locator('.kcac-final-penalty').count(),1);
    assert.match(await page.locator('.kcac-final-penalty').innerText(),/최종 합산에서 1회 반영/);
    assert.match(await page.locator('.kcac-final-penalty').innerText(),/−2점/);
    assert.deepEqual(await page.locator('.score-card .total-score').allTextContents(),[48,48,16,16].map(n=>'평가항목 합계 · 시간 감점 전'+n));
    assert.ok((await page.locator('.rank-box').innerText()).includes('126'));
    for(const text of await page.locator('.score-card').allTextContents())assert.doesNotMatch(text,/감점 -|시간 -|시간 감점.*−2/,'no per-judge repeated penalty');
    assert.equal(await page.locator('.score-card').count(),4);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});assert.equal((await inspectPage(page)).pageOverflow,false);
      assert.deepEqual(await auditTextContrast(page,'.kcac-final-penalty'),[]);
      assert.equal(await page.locator('.score-card-header').evaluateAll(headers=>headers.every(header=>{const title=header.querySelector('.judge-name').getBoundingClientRect(),score=header.querySelector('.total-score').getBoundingClientRect(),bounds=header.getBoundingClientRect();return title.right<=score.left+1&&score.right<=bounds.right+1;})),true,'judge title and gross-score caption do not overlap at '+width+'px');
      if(width===390)await page.locator('.score-card-header').first().screenshot({path:'tmp/stage315-qa/gross-header-390.png'});
    }
    await page.locator('.kcac-final-penalty').screenshot({path:'tmp/stage315-qa/single-penalty.png'});
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run('KCAC','QA 결선 선수','01070001111','315315','2099-01-01T00:00:00Z');
    const player=await api.rpc('verifyOTP','QA 결선 선수','01070001111','KCAC','315315','결선');
    const markup=await page.locator('#res-body').innerHTML();await page.evaluate(res=>renderResult(res),player);
    assert.equal(await page.locator('#res-body').innerHTML(),markup,'player and admin use the same authoritative gross subtotal metadata');
    const legacy={...preview,scores:preview.scores.map(row=>{const copy={...row};delete copy.kcacGrossScore;return copy;})};
    await page.evaluate(res=>renderResult(res),legacy);
    assert.ok((await page.locator('.score-card .total-score').first().innerText()).includes('개별 제출 기록'),'old cached responses are labeled as records rather than reconstructed by guesswork');
    assert.ok((await page.locator('.rank-box').innerText()).includes('126'));assert.equal(await page.locator('.kcac-final-penalty').count(),1);
    await page.evaluate(()=>{const s={round:'예선',라운드:'예선','예선 Pattern Completion(패턴 완성도)':3,리프수감점:2,감점:2};document.getElementById('res-body').replaceChildren(buildScoreCard(s,'KCAC',1));});
    assert.equal(await page.locator('.kcac-final-penalty').count(),0);assert.match(await page.locator('.score-card').innerText(),/리프 -2/,'preliminary leaf penalties remain visible');
    assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();assert.equal(api.snapshot(),before);
  }finally{await qa.close();api.close();}
});
