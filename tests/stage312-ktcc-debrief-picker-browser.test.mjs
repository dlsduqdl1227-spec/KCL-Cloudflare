import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKtccTournamentFixture} from './helpers/ktcc-tournament-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

test('KTCC quarter/semi/final selector switches only that match, rank and progress with no API writes or extra loads',async()=>{
  const api=await createKtccTournamentFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage312-qa',{recursive:true});
  try{
    const before=api.snapshot(),player=await api.player(2);
    for(const actor of [api.actor,api.actors.lead]){
      const page=await qa.page(390,1000),requests=[];
      page.on('request',request=>{if(request.url().endsWith('/api/rpc'))requests.push(request.postDataJSON()?.action);});
      await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),actor);
      await page.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=KTCC');
      await page.waitForFunction(()=>_adminPreviewOptionsCode==='KTCC'&&_adminPreviewOptions.length>0);
      await page.locator('#sel-phase').selectOption('결선');
      const index=await page.evaluate(()=>_adminPreviewOptions.findIndex(item=>item.unit==='2'&&item.round==='결선'));
      await page.locator('#admin-preview-unit').selectOption(String(index));await page.locator('#admin-preview-open').click();
      await page.waitForFunction(()=>document.getElementById('pResult').classList.contains('active')&&document.querySelector('.ktcc-debrief-picker'));
      const picker=page.getByRole('group',{name:'KTCC 경기 선택'});
      assert.deepEqual(await picker.locator('button').allTextContents(),['8강','4강','최종']);
      assert.ok(!(await page.locator('.report-intro').innerText()).includes('공개 항목 3건'),'selected-match view does not imply three visible evaluation cards');
      assert.equal(await picker.getByRole('button',{name:'최종',exact:true}).getAttribute('aria-pressed'),'true');
      const original=await page.evaluate(()=>JSON.stringify(_lastResult)),loaded=requests.length;
      for(const [stage,label,rank,points,outcome]of [['8강','8강',1,7,'4강 진출'],['4강','4강',2,7,'최종 진출'],['결승','최종',2,6,'준우승'],['8강','8강',1,7,'4강 진출']]){
        await picker.getByRole('button',{name:label,exact:true}).click();
        assert.equal(await picker.locator('[aria-pressed=true]').count(),1);
        const match=page.locator('.ktcc-debrief-match:not([hidden])');assert.equal(await match.count(),1);assert.equal(await match.getAttribute('data-ktcc-stage'),stage);
        assert.equal(await match.locator('.total-score').innerText(),String(points));
        assert.equal(await page.locator('.rank-box .cell>small').first().innerText(),label+' 순위');
        assert.equal(await page.locator('.rank-box b').innerText(),rank+'위');assert.ok((await match.innerText()).includes(outcome));
        const text=await page.locator('#res-body').innerText();
        for(const other of ['8강','4강','최종'].filter(value=>value!==label))assert.ok(!text.includes(other+' 2 원문 의견'));
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:1000});const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
          assert.deepEqual(await auditTextContrast(page,'.ktcc-debrief-picker'),[]);
          assert.equal(await picker.locator('button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),true);
          if(actor===api.actor&&stage==='4강')await page.screenshot({path:'tmp/stage312-qa/semifinal-'+width+'.png',fullPage:true});
        }
      }
      assert.equal(requests.length,loaded,'stage changes are local display filters, not more DB queries');
      assert.equal(await page.evaluate(()=>JSON.stringify(_lastResult)),original,'rendering never changes scores, comments or rank metadata');
      await picker.getByRole('button',{name:'4강',exact:true}).focus();
      await page.keyboard.press('Enter');assert.equal(await picker.getByRole('button',{name:'4강',exact:true}).getAttribute('aria-pressed'),'true');
      await page.evaluate(res=>renderResult(res),player);
      assert.equal(await picker.getByRole('button',{name:'최종',exact:true}).getAttribute('aria-pressed'),'true');
      await picker.getByRole('button',{name:'8강',exact:true}).click();assert.equal(await page.locator('.rank-box b').innerText(),'1위');
      const eliminated=await api.player(3);await page.evaluate(res=>renderResult(res),eliminated);
      assert.deepEqual(await picker.locator('button').allTextContents(),['8강','4강']);assert.equal(await picker.getByRole('button',{name:'4강',exact:true}).getAttribute('aria-pressed'),'true');
      assert.ok((await page.locator('.ktcc-debrief-match:not([hidden])').innerText()).includes('탈락'));
      await page.evaluate(res=>renderResult(res),await api.player(8));assert.deepEqual(await picker.locator('button').allTextContents(),['8강']);
      await page.evaluate(res=>renderResult(res),await api.player(2,'예선'));assert.equal(await picker.count(),0,'preliminary stays independent');
      assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    }
    assert.equal(api.snapshot(),before,'all interactions leave official evaluations and schedules byte-identical');
  }finally{await qa.close();api.close();}
});
