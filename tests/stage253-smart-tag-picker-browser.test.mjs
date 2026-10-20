import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';
const qa=await createBrowserFixture();
fs.mkdirSync('tmp/stage253-tags',{recursive:true});
async function openPicker(page,scope) {
 const launch=page.locator(scope+' .kcl-tag-launch').first();
 await launch.click();
 await page.waitForSelector('#kcl-smart-tag-picker[open]');
}
async function closePicker(page) {await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-done').click();}
async function searchTag(page,text) {await page.locator('#kcl-tag-search').fill(text);}
const picker='#kcl-smart-tag-picker';
try{
 for(const width of [320,390,768,1440]){
  const page=await qa.page(width,844,width<400?{isMobile:true,hasTouch:true}:{});
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(()=>{
   _judge={name:'QA',type:'ADMIN',accountType:'ADMIN',judgeToken:'local-only'};
   refreshParticipantAssignmentsForActiveComp_=()=>{};
   // This suite intentionally reuses synthetic forms; draft restoration is tested separately.
   kclMaybeRestoreDraftForActiveEval_=()=>{};
   _selComp={code:'KCR',name:'KCR',currentRound:'결선',isActive:true};
   initCuppingEval([201,202],'결선평가','Blending',true,false,{id:'qa',label:'스테이션 1',start:201,end:202});
   _cupping.cups[0].noteOverall='보존할 수기 종합 코멘트';
   _cupping.cups[0].flavor=3.8;renderCuppingAttrCard();
  });
  await page.locator('#cupping-lock-cb').check();
  await page.locator('#kcr-sensory-comment-flavor').fill('직접 남긴 향미 기록 유지');
  const before=await page.evaluate(()=>({score:_cupping.cups[0].flavor,note:_cupping.cups[0].noteOverall,lock:_cupping.cups[0].flavorLocked,peer:JSON.stringify(_cupping.cups[1])}));
  await openPicker(page,'#cupping-attr-card');
  assert.equal(await page.locator('#kcl-tag-search').evaluate(el=>el===document.activeElement),false,'mobile keyboard should not open automatically');
  await searchTag(page,'블루베리');
  await page.locator(picker+' .kcl-tag-picker-option').first().click();
  assert.equal(await page.locator(picker+' .kcl-tag-picker-option').first().getAttribute('aria-pressed'),'true');
  assert.match(await page.locator(picker+' .kcl-tag-picker-selected').innerText(),/블루베리/);
  for(const tag of ['라즈베리','딸기','오렌지','레몬']){
   await searchTag(page,tag);await page.locator(picker+' .kcl-tag-picker-option').first().click();
  }
  assert.equal(await page.evaluate(()=>_cupping.cups[0].flavorTagIds.length),5);
  await searchTag(page,'아몬드');await page.locator(picker+' .kcl-tag-picker-option').first().click();
  assert.equal(await page.evaluate(()=>_cupping.cups[0].flavorTagIds.length),5,'existing maximum enforced');
  assert.match(await page.locator(picker+' .kcl-tag-picker-status').innerText(),/최대|개수/);
  await page.locator(picker+' .kcl-tag-picker-chip').first().click();
  assert.equal(await page.evaluate(()=>_cupping.cups[0].flavorTagIds.length),4);
  const state=await page.evaluate(()=>({score:_cupping.cups[0].flavor,note:_cupping.cups[0].noteOverall,lock:_cupping.cups[0].flavorLocked,peer:JSON.stringify(_cupping.cups[1])}));
  assert.deepEqual(state,before,'only selected tags can change, never scores/locks/other cups');
  assert.equal(await page.locator('#kcr-sensory-comment-flavor').inputValue(),'직접 남긴 향미 기록 유지');
  await searchTag(page,'');
  assert.equal(await page.locator(picker).evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,'modal itself has no hidden bottom actions');
  assert.equal(await page.locator(picker).evaluate(el=>{let r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true);
  assert.equal(await page.locator(picker+' .kcl-tag-picker-done').evaluate(el=>{let r=el.getBoundingClientRect();return r.height>=44&&r.bottom<=innerHeight;}),true);
  await page.screenshot({path:`tmp/stage253-tags/kcr-${width}.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(picker).evaluate(el=>el.open),false);
  assert.equal(await page.locator('#cupping-attr-card .kcl-tag-launch').evaluate(el=>el===document.activeElement),true);
  await page.locator('#cupping-next-cup').click();
  assert.equal(await page.evaluate(()=>_cupping.cups[1].flavorTagIds.length),0);
  await page.locator('#cupping-previous-cup').click();
  assert.equal(await page.evaluate(()=>_cupping.cups[0].flavorTagIds.length),4);
  // The original list remains available and still uses the same handlers.
  await page.locator('#cupping-attr-card .kcl-tag-fallback').click();
  assert.equal(await page.locator('#cupping-attr-card .category-primary').isVisible(),true);
  await openPicker(page,'#cupping-attr-card');
  await page.evaluate(()=>switchCuppingCup(1));
  await page.waitForFunction(()=>!document.getElementById('kcl-smart-tag-picker').open);
  assert.equal(await page.evaluate(()=>_cupping.cups[1].flavorTagIds.length),0,'stale picker must not edit a new cup');
  await openPicker(page,'#cupping-attr-card');
  await page.evaluate(()=>hideEval());
  await page.waitForFunction(()=>!document.getElementById('kcl-smart-tag-picker').open);
  // IKRC: direct-entry and positive + refinement remain independent.
  await page.evaluate(()=>{
   _selComp={code:'IKRC',name:'IKRC',currentRound:'예선'};
   initIkrcSamples(['A-1','A-2'],{id:'qa-i',label:'QA',prefix:'A',start:1,end:2});
   _ikrcCurrentAttr='mouthfeel';renderIkrcAttrCard();
  });
  await openPicker(page,'#ikrc-attr-card');
  const custom=page.locator(picker+' .kcl-tag-picker-custom input');
  await custom.fill('나만의 직접 표현');await page.locator(picker+' .kcl-tag-picker-custom button').click();
  assert.match(await page.locator(picker+' .kcl-tag-picker-selected').innerText(),/나만의 직접 표현/);
  for(const group of ['주요 표현','보완 표현']){
   await page.locator(picker+' nav button').filter({hasText:group}).click();
   await page.locator(picker+' .kcl-tag-picker-option').first().click();
  }
  assert.equal(await page.locator(picker+' .kcl-tag-picker-chip').count(),3);
  await closePicker(page);
  const ikrcSelected=await page.evaluate(()=>JSON.stringify(_ikrcSamples[0][ikrcTagKey_('mouthfeel')]));
  await page.evaluate(()=>{saveIkrc();loadIkrcSample(1);});
  assert.equal(await page.evaluate(()=>_ikrcSamples[1][ikrcTagKey_('mouthfeel')].length),0);
  await page.evaluate(()=>loadIkrcSample(0));
  assert.equal(await page.evaluate(()=>JSON.stringify(_ikrcSamples[0][ikrcTagKey_('mouthfeel')])),ikrcSelected);
  // KCAC: visual tags retain their tone, never duplicate into the other pattern.
  await page.evaluate(()=>{
   _selComp={code:'KCAC',name:'KCAC',currentRound:'예선'};startKcac();
   document.getElementById('kcac-num').value='1';onKcacParticipantSelected_();setKcacQualFirstPattern_('dynamic');
  });
  // Let startKcac's existing delayed initial-render callback finish before acting.
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
  await openPicker(page,'#kcac-attrs');
  assert.ok(await page.locator(picker+' nav button').count()>=2);
  await page.locator(picker+' .kcl-tag-picker-option').first().click();
  await page.locator(picker+' nav button').filter({hasText:'보완'}).click();
  await page.locator(picker+' .kcl-tag-picker-option').first().click();
  assert.equal(await page.locator(picker+' .kcl-tag-picker-chip').count(),2,JSON.stringify(await page.evaluate(()=>_kcac.jars.map(j=>j.smartTags))));
  assert.equal(await page.locator(picker+' .kcl-tag-picker-option[aria-pressed=true]').first().evaluate(el=>el.classList.contains('refinement')),true);
  await closePicker(page);
  const kcacState=await page.evaluate(()=>JSON.stringify(_kcac.jars[0].smartTags));
  await page.evaluate(()=>switchKcacJar(1));await page.evaluate(()=>switchKcacJar(0));
  assert.equal(await page.evaluate(()=>JSON.stringify(_kcac.jars[0].smartTags)),kcacState);
  if(width===390){
   await page.setViewportSize({width:390,height:250});
   await openPicker(page,'#kcac-attrs');
   assert.equal(await page.locator(picker).evaluate(el=>el.classList.contains('kcl-tag-short')),true);
   await page.locator(picker+' .kcl-tag-picker-done').scrollIntoViewIfNeeded();
   assert.equal(await page.locator(picker+' .kcl-tag-picker-done').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'landscape/keyboard height must not clip confirmation');
   await closePicker(page);
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>history.pushState({qaPickerBack:true},'',location.href));
   await openPicker(page,'#kcac-attrs');
   await page.goBack();
   await page.waitForFunction(()=>!document.getElementById('kcl-smart-tag-picker').open);
  }
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close();
 }
}finally{await qa.close();}
console.log('Stage253 tag picker: selection limits, custom tags, tone groups, original comments/scores/locks, per-cup state and 320/390/768/1440px verified.');
