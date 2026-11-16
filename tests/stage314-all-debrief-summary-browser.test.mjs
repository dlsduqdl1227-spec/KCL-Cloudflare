import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllSummaryFixture} from './helpers/all-summary-fixture.mjs';
import {createKtccTournamentFixture} from './helpers/ktcc-tournament-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

test('all seven competition reports show round-local summaries with exact public/preview parity at phone, tablet and desktop widths',async()=>{
  const api=await createAllSummaryFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage314-qa',{recursive:true});
  try{
    const before=api.snapshot();
    for(const c of api.cases){
      const page=await qa.page(390,1000);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
      for(const [i,round]of c.rounds.entries()){
        const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[i],round,api.actor,round),player=await api.publicRound(c,round);
        assert.equal(preview.success,true);assert.equal(player.success,true);
        await page.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);
        const report=page.locator('#res-body'),html=await report.innerHTML();
        const summaries=page.locator('.competition-combined-comment,.ikrc-combined-comment');
        assert.equal(await summaries.count(),1,c.code+' '+round+' has one round/match summary');
        const summary=await summaries.innerText();assert.match(summary,/심사위원 종합 코멘트/);
        if(c.code!=='IKRC'){
          if(!['KTCC','MOC'].includes(c.code))assert.ok(summary.includes(c.code+' '+round+' 첫번째 심사 원문'),c.code+' first opinion');
          assert.ok(summary.includes(c.code+' '+round+' 두번째 심사 원문'),c.code+' second opinion');
          for(const other of c.rounds.filter(value=>value!==round))assert.ok(!summary.includes(c.code+' '+other+' '),c.code+' cannot mix '+other);
          if(c.code!=='KTCC'&&c.code!=='KCAC')assert.match(summary,/오렌지/);
          if(c.code==='KBC'&&round==='결선')assert.match(summary,/시그니처 레몬/);
          if(c.code==='KCAC')assert.match(summary,/라인 명확/);
        }
        await page.evaluate(res=>renderResult(res),player);
        assert.equal(await report.innerHTML(),html,c.code+' '+round+' public and manager summary are identical');
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:1000});const layout=await inspectPage(page);
          assert.equal(layout.pageOverflow,false,c.code+' '+round+' '+width);assert.deepEqual(layout.overflow,[]);
          assert.deepEqual(await auditTextContrast(page,'.competition-combined-comment'),[]);
        }
        assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
        if(round==='결선'&&c.code!=='IKRC')await summaries.screenshot({path:'tmp/stage314-qa/'+c.code+'-summary.png'});
      }
      await page.close();
    }
    assert.equal(api.snapshot(),before,'summaries never save, re-grade, review or rewrite existing competition records');
  }finally{await qa.close();api.close();}
});

test('KTCC stage picker shows only the selected match summary and preserves all round scores and original comments',async()=>{
  const api=await createKtccTournamentFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  try{
    const before=api.snapshot(),result=await api.player(2),page=await qa.page(390,1000);
    await page.goto(qa.origin+'/debriefing/');await page.evaluate(res=>{renderResult(res);showPanel('pResult');},result);
    const picker=page.getByRole('group',{name:'KTCC 경기 선택'});
    for(const [label,stage,points]of [['8강','8강',7],['4강','4강',7],['최종','결승',6]]){
      await picker.getByRole('button',{name:label,exact:true}).click();
      const active=page.locator('.ktcc-debrief-match:not([hidden])'),summary=active.locator('.competition-combined-comment');
      assert.equal(await summary.count(),1);assert.ok((await summary.innerText()).includes((label==='최종'?'최종':stage)+' 2 원문 의견'));
      assert.ok((await summary.innerText()).includes('총점 '+points+'점'));
      if(stage==='결승')assert.match(await summary.innerText(),/히든미션 오답 \(0점\)/);
      assert.equal(await page.locator('.competition-combined-comment:visible').count(),1);
      assert.equal(await active.locator('.total-score').innerText(),String(points));
      assert.equal((await inspectPage(page)).pageOverflow,false);
    }
    assert.deepEqual(page.qaErrors,[]);await page.close();assert.equal(api.snapshot(),before);
  }finally{await qa.close();api.close();}
});
