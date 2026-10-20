import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage251-qa',{recursive:true});
try{
 const {judges,stations}=await seedKcrStations(api);
 for(let n=5;n<=9;n++)await api.rpc('upsertParticipant',{competitionCode:'KCR',name:'비공개 선수 '+n,uniqueNo:String(n),prelimCupNo:String(n)},api.actor);
 const station={...stations[1],end:9};
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:[station],byRound:{예선:[station]}}}},api.actor);
 const configs=(await api.rpc('getConfig')).configs;
 for(const width of [320,390,768,1440]){
  const page=await qa.page(width,844,width<400?{isMobile:true,hasTouch:true}:{});
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor:judges[1],configs});
  await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken&&registeredTargetsForRange_('KCR',['1','9']).validated);
  await page.locator('#kcr-station-grid [data-station-id=stable-b]').click();
  await page.evaluate(()=>{window.__testCups=structuredClone(_cupping.cups);});
  for(const count of [6,7,8,9]){
   await page.evaluate(count=>{
    _cupping.cups=structuredClone(__testCups.slice(0,count));
    _cupping.cups.forEach((c,i)=>{c.cupNumber=201+i;c.flavor=2.4+i*.2;c.noteOverall='직접 기록한 원문 '+(201+i);});
    _cupping.currentIdx=0;_cupping.currentAttr='flavor';renderCuppingCupNav();renderCuppingAttrCard();
   },count);
   const layout=await page.locator('#cupping-cup-nav').evaluate(nav=>[...nav.querySelectorAll('.cup-btn')].map(b=>({
    number:b.querySelector('.cup-btn-num').textContent,top:b.getBoundingClientRect().top,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height
   })));
   assert.deepEqual(layout.map(b=>b.number),Array.from({length:count},(_,i)=>String(201+i)));
   assert.ok(layout.every(b=>b.top===layout[0].top&&b.width>=44&&b.height>=44));
   assert.doesNotMatch(await page.locator('#cupping-cup-nav').innerText(),/비공개 선수/);
   await page.locator('#cupping-cup-nav .cup-btn').last().click();
   assert.equal(await page.evaluate(()=>_cupping.currentIdx),count-1);
   await page.locator('#cupping-cup-nav .cup-btn').first().click();
   assert.equal(await page.locator('#cupping-score-slider').inputValue(),'2.4');
   assert.equal(await page.evaluate(()=>_cupping.cups[0].noteOverall),'직접 기록한 원문 201');
   assert.equal(await page.locator('#cupping-cup-nav .cup-btn').first().getAttribute('aria-pressed'),'true');
   assert.equal((await inspectPage(page)).pageOverflow,false);
  }
  await page.screenshot({path:`tmp/stage251-qa/cups-${width}.png`});
  await page.locator('#cupping-lock-cb').check();
  assert.equal(await page.locator('#cupping-score-slider').isDisabled(),true);
  assert.equal(await page.locator('#cupping-lock-cb').evaluate(el=>el.getBoundingClientRect().width),22);
  if(width===390){
   let release;
   const delayed=new Promise(resolve=>{release=resolve;});
   const intercept=async route=>{
    if(route.request().postDataJSON()?.action!=='generateCuppingComment')return route.fallback();
    await delayed;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,comments:['이전 컵 전용 생성 문안']})});
   };
   await page.route('**/api/rpc?*',intercept);
   await page.evaluate(()=>{switchCuppingAttr('comment');setKcrOverallCommentEnabled_(true);});
   const request=page.waitForRequest(r=>r.url().includes('/api/rpc')&&r.postDataJSON()?.action==='generateCuppingComment');
   await page.evaluate(()=>generateCuppingComment());
   await request;
   await page.evaluate(()=>{switchCuppingCup(1);switchCuppingAttr('comment');});
   const secondCup=await page.evaluate(()=>JSON.stringify(_cupping.cups[1]));
   const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='generateCuppingComment');
   release();await response;
   await page.waitForFunction(()=>!document.querySelector('#gen-comment-area')?.textContent.includes('생성 중'));
   assert.doesNotMatch(await page.locator('#cupping-attr-card').innerText(),/이전 컵 전용 생성 문안/);
   assert.equal(await page.evaluate(()=>JSON.stringify(_cupping.cups[1])),secondCup);
   await page.unroute('**/api/rpc?*',intercept);
  }
  const saved=await page.evaluate(()=>JSON.stringify(_cupping.cups));
  await page.evaluate(actor=>{
   _judge=actor;hideEval();showPanel('pAdmin');adminSwitchSection('run');
   renderOperationalHealth_({success:true,available:true,state:'warning',requests:200,errors:2,errorPercent:1,resourceErrors:2,cpuP50Ms:2.5,cpuP99Ms:18,
    windowStart:'2026-10-20T07:30:00Z',windowEnd:'2026-10-20T07:45:00Z',updatedAt:'2026-10-20T07:46:00Z'});
  },api.actor);
  assert.match(await page.locator('#server-health-body').innerText(),/200건|18.00 ms/);
  assert.doesNotMatch(await page.locator('#pAdmin').innerText(),/D1 계정 사용량|남음/);
  await page.locator('#server-health-card').scrollIntoViewIfNeeded();
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.screenshot({path:`tmp/stage251-qa/health-${width}.png`});
  await page.evaluate(()=>renderOperationalHealth_({success:true,available:false,state:'unavailable',message:'집계 연결을 확인해주세요.'}));
  assert.doesNotMatch(await page.locator('#server-health-body').innerText(),/정상|0건/);
  assert.equal(await page.evaluate(()=>JSON.stringify(_cupping.cups)),saved);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close();
 }
}finally{await qa.close();api.close();}
console.log('Stage251 one-row 6/7/8/9 cups, touch targets, score/comment isolation, blind identity and health states passed at 320/390/768/1440px.');
