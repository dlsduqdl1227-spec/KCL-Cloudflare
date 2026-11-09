import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture, inspectPage, selectOperationsCompetition} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKbcMain} from './stage264-kbc-main-days.test.mjs';

const api = await createRpcFixture();
const qa = await createBrowserFixture({apiHandler:api.handle});
const out = 'tmp/stage284-qa';
fs.mkdirSync(out,{recursive:true});

async function checkLayout(page, label) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const visible = element => element.getClientRects().length > 0;
    const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 &&
      Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const contained = (outer,inner) => inner.left>=outer.left-1 && inner.right<=outer.right+1 &&
      inner.top>=outer.top-1 && inner.bottom<=outer.bottom+1;
    const name = element => element.id || element.textContent.trim().slice(0,30);
    const bounds = element => {
      if (element.matches('a,button,select,.report-actions,.ranking-actions')) return [element.getBoundingClientRect()];
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects());
    };
    function check(container, selector) {
      const outer = container.getBoundingClientRect();
      const items = Array.from(container.querySelectorAll(selector)).filter(visible);
      items.forEach((item,i) => {
        const rect = item.getBoundingClientRect();
        const content = bounds(item);
        if (!contained(outer,rect) || content.some(b=>!contained(outer,b))) issues.push('clipped: '+name(item));
        for (const other of items.slice(i+1)) {
          if (content.some(a=>bounds(other).some(b=>overlaps(a,b)))) issues.push('overlap: '+name(item)+' / '+name(other));
        }
      });
    }
    check(document.querySelector('.ranking-round-controls'),'label,select,button');
    check(document.querySelector('.rank-summary'),'.rank-summary-title,.rank-summary-sub,.report-actions');
    check(document.querySelector('.report-actions'),'button');
    check(document.getElementById('kbc-finalist-entry'),':scope > :is(h3,strong,p,a,button,.ranking-actions), #kbc-finalist-plan :is(p,li)');
    const finalistActions=document.querySelector('#kbc-finalist-entry .ranking-actions');
    if (finalistActions) check(finalistActions,'a,button');
    for (const row of document.querySelectorAll('.rank-row')) check(row,'.rank-num,.rank-info,.rank-score');
    for (const control of document.querySelectorAll('.report-actions button,#kbc-finalist-entry a,#kbc-finalist-entry button')) {
      if (control.getBoundingClientRect().height < 44) issues.push('small target: '+name(control));
    }
    return issues;
  });
  if (problems.length || [390,1388].includes(page.viewportSize().width)) {
    await page.screenshot({path:out+'/'+label+(problems.length?'-failed':'')+'.png',fullPage:true});
  }
  assert.deepEqual(problems,[],label);
  assert.equal((await inspectPage(page)).pageOverflow,false,label);
}

const dimensions = [[1388,814],[768,920],[390,844],[320,720]];
try {
  await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'본선',isActive:true},api.actor);
  const page = await qa.page(...dimensions[0]);
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
  await selectOperationsCompetition(page,'KBC');
  await page.locator('#admin-comp-list [data-workspace-competition=KBC] [data-act=rank]').click();
  const card = page.locator('#kbc-finalist-entry');
  const status = card.getByRole('status');
  await status.getByText(/현재 결선 배정 0명/).waitFor();
  assert.match(await page.locator('#ranking-list').innerText(),/본선에 아직 집계된 평가가 없습니다/);
  for (const [width,height] of dimensions) {
    await page.setViewportSize({width,height});
    await checkLayout(page,'kbc-empty-'+width);
  }

  await seedKbcMain(api);
  const snapshot = () => JSON.stringify(['scores','participants','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
  const before = snapshot();
  await page.getByRole('button',{name:'선택한 라운드 순위 새로고침'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#kbc-finalist-plan li').length===6);
  assert.equal(await page.locator('.rank-row').count(),8);
  for (const [width,height] of dimensions) {
    await page.setViewportSize({width,height});
    await checkLayout(page,'kbc-populated-'+width);
  }
  const refreshed = page.waitForResponse(response=>response.request().postDataJSON()?.action==='getKbcFinalistPlan');
  await card.getByRole('button',{name:'진출 예상 명단 새로고침'}).click();
  assert.equal((await (await refreshed).json()).success,true);
  await status.getByText(/현재 결선 배정 0명/).waitFor();
  const opening = page.waitForEvent('popup');
  await card.getByRole('link',{name:'결선 진출자 선택'}).click();
  const roster = await opening;
  await roster.waitForURL(qa.origin+'/registry/?kbcView=final');
  await roster.close();

  await page.evaluate(()=>{window.print=()=>{window.qaPrintOpened=true;};});
  await page.locator('#ranking-pdf-button').click();
  await page.waitForFunction(()=>window.qaPrintOpened);
  await page.emulateMedia({media:'print'});
  assert.equal(await card.isVisible(),false,'operational controls are not part of the ranking PDF');
  assert.equal(await page.locator('.rank-row').first().isVisible(),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({media:'screen'});
  await page.locator('#ranking-round-select').selectOption('결선');
  await page.waitForFunction(()=>_ranking?.selectedRound==='결선');
  assert.equal(await card.count(),0,'finalist management belongs to the main round only');
  assert.equal(snapshot(),before,'view, refresh and navigation do not edit stored data');
  assert.deepEqual(page.qaErrors,[]);
  console.log('Stage284: KBC ranking cards and actions do not overlap at four widths, empty and populated; links, refresh, print and round isolation passed.');
} finally {
  await qa.close();
  api.close();
}
