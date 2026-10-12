import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage228-qa',{recursive:true});
try {
 const {judges,stations}=await seedKcrStations(api);
 for(let n=5;n<=9;n++)await api.rpc('upsertParticipant',{competitionCode:'KCR',name:'비공개 선수 '+n,uniqueNo:String(n),prelimCupNo:String(n)},api.actor);
 const station={...stations[1],end:9};
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:[station],byRound:{예선:[station]}}}},api.actor);
 const configs=(await api.rpc('getConfig')).configs;
 for(const width of [320,390,768,1440]) {
  const page=await qa.page(width,844,width<=390?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{});await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor:judges[1],configs});
  await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken&&registeredTargetsForRange_('KCR',['1','9']).validated);
  await page.locator('#kcr-station-grid button[data-station-id="stable-b"]').click();
  await page.waitForFunction(()=>document.body.classList.contains('kcr-viewport-active'));
  assert.equal(await page.locator('#cupping-cup-nav .cup-btn').count(),9);
  await page.locator('#cupping-attr-tabs [data-attr=acidity]').click();
  await page.locator('#cupping-attr-card .kcr-tag-family-btn').filter({hasText:'보완 표현'}).click();
  const dry=page.locator('#cupping-attr-card button').filter({hasText:/^드라이한Dry$/});
  await dry.click();
  const field=page.locator('#kcr-sensory-comment-acidity');
  assert.match(await field.inputValue(),/산미에서 드라이한 감각/);
  assert.equal(await field.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),16);
  await field.fill('산미에서 느낀 드라이한 인상을 직접 기록합니다.');
  await page.locator('#cupping-score-slider').evaluate(el=>{el.value='3.8';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#cupping-lock-cb').check();
  // Synthetic viewport events cover keyboard resize/offset; native iOS zoom is not emulated.
  await field.focus();
  await page.evaluate(()=>{
   window.__viewportOriginal=window.visualViewport;
   const mock=new EventTarget();Object.assign(mock,{height:380,offsetTop:25,scale:1,width:innerWidth});
   Object.defineProperty(window,'visualViewport',{configurable:true,value:mock});
   window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--kcr-viewport-height')==='380px');
  await page.evaluate(()=>document.activeElement.dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
  await page.waitForTimeout(420);
  const keyboard=await page.evaluate(()=>{
   const s=document.querySelector('#evalCupping'),c=s.querySelector('.eval-content'),f=document.activeElement;
   return {screen:s.getBoundingClientRect().toJSON(),content:c.getBoundingClientRect().toJSON(),field:f.getBoundingClientRect().toJSON(),scrollable:c.scrollHeight>c.clientHeight};
  });
  assert.ok(keyboard.screen.bottom<=405.5,JSON.stringify(keyboard));
  assert.ok(keyboard.content.height>60,JSON.stringify(keyboard));
  assert.ok(keyboard.field.top>=keyboard.content.top-1&&keyboard.field.bottom<=keyboard.content.bottom+1,JSON.stringify(keyboard));
  assert.equal(keyboard.scrollable,true);
  const preserved=await page.evaluate(()=>JSON.stringify(_cupping.cups));
  if(width===390)await page.screenshot({path:'tmp/stage228-qa/kcr-keyboard-390.png'});
  await page.evaluate(()=>{visualViewport.scale=2;visualViewport.height=190;window.dispatchEvent(new Event('resize'));});
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--kcr-viewport-height')),'380px','intentional pinch zoom cannot shrink/rebuild the form');
  assert.equal(await page.evaluate(()=>JSON.stringify(_cupping.cups)),preserved);
  await page.evaluate(()=>{document.activeElement.blur();Object.defineProperty(window,'visualViewport',{configurable:true,value:__viewportOriginal});window.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--kcr-viewport-height')==='844px');
  // Rapid touchend events cannot cancel the second button action.
  assert.deepEqual(await page.locator('#cupping-attr-tabs [data-attr=comment]').evaluate(el=>[1,2].map(()=>{const e=new Event('touchend',{bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;})),[false,false]);
  assert.equal(await page.locator('#cupping-attr-tabs [data-attr=comment]').evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
  await page.locator('#cupping-cup-nav .cup-btn').nth(8).click();
  assert.equal(await page.locator('#cupping-cup-nav').evaluate(nav=>{const n=nav.getBoundingClientRect(),b=nav.querySelector('.active').getBoundingClientRect();return b.left>=n.left&&b.right<=n.right+1;}),true,'selected ninth cup stays visible');
  await page.locator('#cupping-attr-tabs [data-attr=acidity]').click();
  assert.equal(await page.evaluate(()=>_cupping.cups[8].acidityTagIds.includes('acidity_dry')),false);
  await page.locator('#cupping-cup-nav .cup-btn').first().click();
  assert.equal(await field.inputValue(),'산미에서 느낀 드라이한 인상을 직접 기록합니다.');
  assert.equal(await page.locator('#cupping-score-slider').inputValue(),'3.8');
  assert.equal(await page.locator('#cupping-score-slider').isDisabled(),true);
  await page.locator('#cupping-attr-tabs [data-attr=comment]').click();
  await page.evaluate(()=>setKcrOverallCommentEnabled_(false));
  await page.locator('#cupping-comment-input').fill('전체 코멘트는 속성 코멘트와 독립적으로 보존합니다.');
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.locator('#evalCupping button[onclick="cuppingSubmitAll()"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`tmp/stage228-qa/kcr-comment-${width}.png`});
  if(width===1440) {
   await page.locator('#evalCupping button[onclick="cuppingSubmitAll()"]').click();
   await page.waitForFunction(()=>activePanelId_()==='pCuppingSetup'&&_kcrCompletionState?.officialUnits.length===9);
   assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,9);
   await page.locator('#kcr-station-help button').click();await page.locator('#kcr-review-unit').waitFor();
   await page.selectOption('#kcr-review-unit','1');
   await page.locator('.review-edit-btn').first().click();await page.locator('#pReviewEdit.active').waitFor();
   await page.locator('#review-edit-fields .review-attr-tabs .review-eval-like-tab').filter({hasText:'Acidity'}).click();
   assert.match(await page.locator('#review-edit-fields').innerText(),/드라이한/);
   assert.equal(await page.locator('#review-kcr-comment-22').inputValue(),'산미에서 느낀 드라이한 인상을 직접 기록합니다.');
   assert.equal(await page.locator('#review-edit-fields textarea').filter({visible:true}).count()>0,true);
   const detail=await api.rpc('getReviewList','KCR',judges[1]);
   assert.match(JSON.stringify(detail.list.find(r=>r.unit==='1')),/acidity_dry/);
   assert.match(JSON.stringify(detail.list.find(r=>r.unit==='1')),/전체 코멘트는 속성 코멘트와 독립적으로 보존/);
   assert.doesNotMatch(JSON.stringify(detail.list.find(r=>r.unit==='9')),/acidity_dry/);
   for(const size of [320,390,768,1440]){
    await page.setViewportSize({width:size,height:844});
    assert.equal((await inspectPage(page)).pageOverflow,false,'review '+size);
    for(const t of await page.locator('#review-edit-fields textarea').all())if(await t.isVisible())assert.ok(await t.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=16);
   }
   await page.setViewportSize({width:390,height:844});
   await page.locator('#review-kcr-comment-22').focus();
   await page.evaluate(()=>{
    const mock=new EventTarget();Object.assign(mock,{height:400,offsetTop:18,scale:1,width:innerWidth});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:mock});window.dispatchEvent(new Event('resize'));
   });
   await page.waitForFunction(()=>document.getElementById('pReviewEdit').getBoundingClientRect().bottom<=418.5);
   assert.equal(await page.locator('#review-kcr-comment-22').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true,'sticky attribute tabs must not cover the review comment');
   await page.screenshot({path:'tmp/stage228-qa/kcr-review-keyboard-390.png'});
   assert.ok(await page.locator('#pReviewEdit .eval-content').evaluate(el=>el.clientHeight)>60);
   await page.locator('#review-kcr-comment-22').fill('검수에서도 드라이한 산미 코멘트를 수정하여 보존합니다.');
   await page.evaluate(()=>{document.activeElement.blur();Object.defineProperty(window,'visualViewport',{configurable:true,value:__viewportOriginal});window.dispatchEvent(new Event('resize'));});
   await page.locator('#review-edit-save-only').click();
   await page.waitForFunction(()=>!document.getElementById('overlay').classList.contains('active'));
   const updated=await api.rpc('getReviewList','KCR',judges[1]);
   assert.match(JSON.stringify(updated.list.find(r=>r.unit==='1')),/검수에서도 드라이한 산미 코멘트/);
   assert.match(JSON.stringify(updated.list.find(r=>r.unit==='1')),/acidity_dry/);
   assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,9,'review saves cannot create duplicates');
  }
  await page.evaluate(()=>{hideEval();showPanel('pLogin');});
  await page.waitForFunction(()=>!document.body.classList.contains('kcr-viewport-active'));
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--kcr-viewport-height')),'');
  assert.equal(await page.evaluate(()=>KCL_SENSORY_SMART_TAGS.acidity['보완 표현'].includes('드라이한')),false,'Dry is KCR-only, shared competition tags stay unchanged');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close();console.log('Stage228 KCR mobile, keyboard, touch, Dry, cup isolation and layout passed at '+width+'px.');
 }
} finally {await qa.close();api.close();}
