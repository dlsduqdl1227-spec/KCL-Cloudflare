import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKcacFinalPenaltyFixture} from './helpers/kcac-final-penalty-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

test('KCAC four-head final debrief separates two pattern evaluations and regular/plant sensory with public-preview parity',async()=>{
  const api=await createKcacFinalPenaltyFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage317-qa',{recursive:true});
  try{
    const before=api.snapshot(),preview=await api.rpc('getAdminDebriefPreview','KCAC','1','결선',api.actor);
    assert.equal(preview.scores.length,4);
    const reordered={...preview,scores:[preview.scores[3],preview.scores[2],preview.scores[0],preview.scores[1]]},unchanged=JSON.stringify(reordered);
    const page=await qa.page(390,1000);await page.goto(qa.origin+'/debriefing/');
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},reordered);
    const titles=()=>page.locator('.score-card .judge-name').evaluateAll(nodes=>nodes.map(node=>node.firstChild.textContent));
    assert.deepEqual(await titles(),['1번 심사위원 패턴디자인 평가','2번 심사위원 패턴디자인 평가','3번 심사위원 일반우유 센서리 평가','4번 심사위원 식물성우유 센서리 평가']);
    assert.deepEqual(await page.locator('.score-card .total-score').allTextContents(),[48,48,16,16].map(n=>'평가항목 합계 · 시간 감점 전'+n));
    assert.equal(await page.locator('.kcac-final-penalty').count(),1);assert.match(await page.locator('.rank-box').innerText(),/126/);
    assert.doesNotMatch(await page.locator('#res-body').innerText(),/QA 결선 헤드|헤드 심사위원|제출일시|대리입력/);
    assert.deepEqual(await page.locator('.round-section>.round-title').allTextContents(),['결선']);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});assert.equal((await inspectPage(page)).pageOverflow,false);
      assert.equal(await page.locator('.score-card-header').evaluateAll(headers=>headers.every(header=>{const title=header.querySelector('.judge-name').getBoundingClientRect(),score=header.querySelector('.total-score').getBoundingClientRect(),bounds=header.getBoundingClientRect();return title.right<=score.left+1&&score.right<=bounds.right+1&&title.bottom<=bounds.bottom+1;})),true,'clear title and subtotal at '+width+'px');
      assert.deepEqual(await auditTextContrast(page,'.score-card-header'),[]);
      if(width===390)await page.locator('.score-card').last().screenshot({path:'tmp/stage317-qa/plant-sensory-390.png'});
    }
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run('KCAC','QA 결선 선수','01070001111','317317','2099-01-01T00:00:00Z');
    const player=await api.rpc('verifyOTP','QA 결선 선수','01070001111','KCAC','317317','결선'),markup=await page.locator('#res-body').innerHTML();
    await page.evaluate(res=>renderResult(res),player);assert.equal(await page.locator('#res-body').innerHTML(),markup,'players see the same role-specific labels without judge identities');
    await page.evaluate(()=>renderResult({competition:'KCAC',playerInfo:{name:'QA'},scores:[{scoreRowId:90,round:'예선',라운드:'예선',패턴종류:'fast',잔용도:'패턴평가',총점:10},{scoreRowId:90,round:'예선',라운드:'예선',패턴종류:'slow',잔용도:'패턴평가',총점:10}]}));
    assert.deepEqual(await titles(),['1번 심사위원 라떼아트 평가','1번 심사위원 라떼아트 평가'],'preliminary cups still share their original anonymous judge number');
    assert.doesNotMatch(await page.locator('#res-body').innerText(),/일반우유|식물성우유/);
    assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    assert.equal(JSON.stringify(reordered),unchanged);assert.equal(api.snapshot(),before,'no evaluation, score, comment, assignment or configuration changes');
  }finally{await qa.close();api.close();}
});
