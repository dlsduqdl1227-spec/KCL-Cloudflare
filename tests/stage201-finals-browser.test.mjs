import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Optional browser regression: supply KCL_PLAYWRIGHT_MODULE if Playwright is bundled outside this repo.
const modulePath = process.env.KCL_PLAYWRIGHT_MODULE;
const {chromium} = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const root = fileURLToPath(new URL('../public/', import.meta.url));
const output = fileURLToPath(new URL('../tmp/finals-browser/', import.meta.url));
fs.mkdirSync(output,{recursive:true});
const server = http.createServer((req,res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:true,competitions:[],configs:[],assignments:[],list:[]})); return; }
  let relative = decodeURIComponent(new URL(req.url,'http://local.test').pathname);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(root,'.' + relative);
  if (!file.startsWith(root) || !fs.existsSync(file)) {res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.png':'image/png','.css':'text/css'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.env.KCL_BROWSER_CHANNEL || 'chrome',headless:true});
try {
  for (const width of [390,1280]) {
    let page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept().catch(()=>{}));
    await page.route('**/*',route=>route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin+'/assessment/',{waitUntil:'load'});
    await page.evaluate(()=> {
      localStorage.clear();
      _judge={name:'QA 관리자',type:'ADMIN',accountType:'ADMIN',role:'관리자',judgeToken:'local-test-only',phone:'01099990000',access:'ALL'};
      _selComp={code:'KCAC',currentRound:'결선',name:'KCAC',isActive:true};
      // Stub transport, not application state transitions. Captured submissions never leave this page.
      window.qaSubmissions=[]; window.qaPendingComments=[];
      function runner(success,failure) { return new Proxy({}, {get(target,key) {
        if(key==='withSuccessHandler') return handler=>runner(handler,failure);
        if(key==='withFailureHandler') return handler=>runner(success,handler);
        return (...args)=>{
          if(key==='submitScores') { qaSubmissions.push(args[0]); return; }
          if(key==='generateKcacComment') { qaPendingComments.push(success); return; }
          if(key==='generateKbcComment') { if(success) success({comments:['QA KBC 코멘트']}); return; }
          if(success) success({success:true,assignments:[],list:[],photos:[],competitions:[]});
        };
      }}); }
      google.script.run=runner();
      refreshParticipantAssignmentsForActiveComp_=()=>{};
      startKcac();
    });
    assert.equal(await page.locator('#pKcacFinalArea').evaluate(el=>el.classList.contains('active')),true);
    await page.locator('#pKcacFinalArea button').filter({hasText:'센서리 · 프레젠테이션'}).click();
    await page.waitForFunction(()=>document.querySelector('#kcac-attrs [data-kcac-score="맛균형"]'));
    await page.locator('#kcac-num').fill('1');
    await page.evaluate(()=>onKcacParticipantSelected_());
    const first=page.locator('#kcac-attrs input[data-kcac-score="맛균형"]');
    await first.fill('4.2');
    await page.locator('#kcac-comment').fill('첫 잔 독립 기록');
    await page.locator('#kcac-comment').dispatchEvent('input');
    await page.evaluate(()=>toggleKcacScoreLock_('맛균형',0));
    await page.locator('#kcac-cup-nav .cup-btn').nth(1).click();
    assert.equal(await page.locator('#kcac-attrs input[data-kcac-score="맛균형"]').inputValue(),'3');
    await page.locator('#kcac-attrs input[data-kcac-score="맛균형"]').fill('2.4');
    await page.locator('#kcac-comment').fill('둘째 잔 독립 기록');
    await page.locator('#kcac-comment').dispatchEvent('input');
    await page.evaluate(()=>generateKcacComment());
    await page.locator('#kcac-cup-nav .cup-btn').nth(0).click();
    await page.evaluate(()=>qaPendingComments.shift()({comments:['이전 잔 응답']}));
    assert.doesNotMatch(await page.locator('#kcac-comment-gen').innerText(),/이전 잔 응답/);
    assert.equal(await first.inputValue(),'4.2');
    assert.equal(await first.isDisabled(),true);
    assert.equal(await page.locator('#kcac-comment').inputValue(),'첫 잔 독립 기록');
    assert.equal(await page.locator('#kcac-leaf-rule-box').isVisible(),false,'finals do not require preliminary leaf counts');
    await page.locator('#kcac-submit-dock .submit-btn-nav').click();
    const submitted=await page.evaluate(()=>qaSubmissions[0]);
    assert.equal(submitted.rows.length,2);
    assert.equal(submitted.rows[0].data[13],4.2);
    assert.equal(submitted.rows[1].data[13],2.4);
    assert.equal(submitted.rows[0].data[23],'첫 잔 독립 기록');
    assert.equal(submitted.rows[1].data[23],'둘째 잔 독립 기록');
    assert.equal(JSON.parse(submitted.rows[0].extraFields['점수잠금'])['맛균형'],true);
    assert.equal(submitted.rows[0].media.count,0,'photo-free submission works in finals');
    assert.equal(await page.evaluate(()=>{_selComp.currentRound='예선';var round=kclDraftRound_();_selComp.currentRound='결선';return round;}),'결선','an open final form keeps its original round after a config refresh');
    const sensoryDraft=await page.evaluate(()=>kclDraftKey_('KCAC'));
    await page.evaluate(()=>{hideOverlay();startKcac('pattern');});
    await page.waitForFunction(()=>document.querySelector('#kcac-attrs [data-kcac-score="주제표현"]'));
    const patternDraft=await page.evaluate(()=>kclDraftKey_('KCAC'));
    assert.notEqual(sensoryDraft,patternDraft,'pattern/sensory drafts must not overwrite one another');
    await page.locator('#kcac-num').fill('1');
    await page.evaluate(()=>onKcacParticipantSelected_());
    assert.ok(await page.getByText('언더필',{exact:true}).count(),'improved completion tags carry into final pattern judging');
    assert.ok(await page.getByText('크레마 경계 번짐',{exact:true}).count());
    await page.evaluate(()=>{ document.querySelectorAll('#kcac-attrs input[data-kcac-score]').forEach(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));}); });
    assert.equal(await page.evaluate(()=>calcKcacJarSubtotal(_kcac.jars[0])),60);
    assert.equal(await page.evaluate(()=>kcacSmartTagPayload_(_kcac.jars[0]) && kcacAttrDisplayName_('완성도',_kcac.jars[0])),'Design Completion(디자인 완성도)');
    await page.evaluate(()=>{updateKcacFinal();document.querySelectorAll('#evalKcac *').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
    await page.screenshot({path:path.join(output,`kcac-pattern-${width}.png`)});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1);
    assert.equal(overflow,false,'no horizontal page overflow at '+width);
    // KBC regeneration must still work after KCAC async guards were added.
    await page.evaluate(()=>{_selComp={code:'KBC',currentRound:'결선'};startKbc();generateKbcComment();});
    assert.match(await page.locator('#kbc-comment-gen').innerText(),/QA KBC 코멘트/);
    await page.evaluate(()=>{_selComp={code:'MOB',currentRound:'결선'};startMob();});
    assert.equal(await page.locator('#mob-menu').inputValue(),'창작');
    assert.equal(await page.locator('#mob-sig-block').isVisible(),true);
    await page.evaluate(()=>{_selComp.currentRound='예선';startMob();});
    assert.equal(await page.locator('#mob-menu').inputValue(),'브루잉');
    assert.equal(await page.locator('#mob-sig-block').isVisible(),false);
    await page.evaluate(()=>{_selComp={code:'MOC',currentRound:'결선'};initMocTargets([1]);});
    assert.equal(await page.evaluate(()=>_moc.s1Cups.length),6);
    assert.equal(await page.evaluate(()=>mocTimeLimitMs_()),360000);
    await page.evaluate(()=>{_selComp={code:'KTCC',currentRound:'결선'};initKtccTargets([1]);});
    assert.deepEqual(await page.evaluate(()=>[_ktcc.s1Cups.length,_ktcc.s2Cups.length,_ktcc.s3Cups.length]),[4,6,6]);
    await page.evaluate(()=>{_selComp={code:'IKRC',currentRound:'결선'};initIkrcSamples(['A-1','A-2'],{id:'qa-station',label:'QA',prefix:'A',start:1,end:2});});
    assert.equal(await page.evaluate(()=>_ikrcSamples.length),2);
    assert.deepEqual(errors,[],'browser errors at '+width);
    await page.close({runBeforeUnload:false});
    page=await browser.newPage({viewport:{width,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept().catch(()=>{}));
    await page.route('**/*',route=>route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin+'/registry/',{waitUntil:'load'});
    await page.evaluate(()=>{
      actor={name:'QA 관리자',accountType:'ADMIN'};
      document.getElementById('main').classList.remove('hidden');
      document.getElementById('comp').value='KBC';
      participantRows=[{rowIndex:1,competitionCode:'KBC',name:'QA 선수',affiliation:'QA',phone:'01012340000',uniqueNo:'8',prelimCupNo:'8',mainCupNo:'3',finalCupNo:'1',extra:{'예선일':'2026-08-19',roundSchedules:{본선:{date:'2026-10-01'},결선:{date:'2026-10-02'}}}}];
      rpc=(action,args,callback)=>{if(action==='upsertParticipant')window.qaRegistration=args[0];};
      updateManualParticipantFields();editParticipant(1);
    });
    assert.equal(await page.locator('#mMainNo').inputValue(),'3');
    assert.equal(await page.locator('#mFinalDate').inputValue(),'2026-10-02');
    await page.locator('#mFinalNo').fill('2');
    await page.locator('#mFinalDate').fill('2026-10-03');
    await page.locator('#participantSaveBtn').click();
    const registration=await page.evaluate(()=>qaRegistration);
    assert.equal(registration.prelimCupNo,'8');
    assert.equal(registration.mainCupNo,'3');
    assert.equal(registration.finalCupNo,'2');
    assert.equal(registration.extra.roundSchedules['결선'].date,'2026-10-03');
    assert.equal(registration.extra['예선일'],'2026-08-19');
    assert.deepEqual(errors,[],'registry browser errors at '+width);
    await page.close();
    console.log('Stage201 finals browser passed at '+width+'px.');
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
