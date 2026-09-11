import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

const api=await createRpcFixture();
const qa=await createBrowserFixture({apiHandler:api.handle});
const codes=['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'];
const output=new URL('../tmp/release-qa/',import.meta.url);
fs.mkdirSync(output,{recursive:true});
let checkedViews=0;
async function check(page,label,{unnamed=true}={}) {
  const r=await inspectPage(page);
  assert.deepEqual(page.qaErrors,[],label+' JavaScript');
  assert.deepEqual(page.qaMissing,[],label+' resources');
  assert.deepEqual(r.duplicateIds,[],label+' duplicate IDs');
  assert.deepEqual(r.brokenImages,[],label+' broken images');
  assert.equal(r.pageOverflow,false,label+' page overflow');
  assert.deepEqual(r.overflow,[],label+' controls outside screen');
  if(unnamed)assert.deepEqual(r.unnamed,[],label+' accessible names');
  checkedViews++;
}
async function shot(page,name) { await page.screenshot({path:fileURLToPath(new URL(name+'.png',output))}); }
try {
  for(const code of codes){
    for(const n of [8,1])await api.rpc('upsertParticipant',{competitionCode:code,name:'QA 선수 '+n,teamName:'QA 팀 '+n,affiliation:'QA 소속',phone:'0101234000'+n,uniqueNo:String(n),teamNo:String(n),prelimCupNo:String(n),mainCupNo:String(n),finalCupNo:String(n),competitionDate:'2026-10-01'},api.actor);
    await api.rpc('updateCompetitionAdminSettings',{code,currentRound:'예선',isActive:true,debriefing:false},api.actor);
  }
  for(const width of [360,768,1440]){
    for(const route of ['/','/admin/','/registry/','/assessment/','/debriefing/','/camera/']){
      const page=await qa.page(width);
      await page.goto(qa.origin+route,{waitUntil:'load'});
      const report=await inspectPage(page);
      assert.ok(report.description,route+' description');
      assert.doesNotMatch(report.viewport,/user-scalable=no|maximum-scale=1(?:,|\.|$)/);
      await check(page,route+width);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.kcl-skip-link').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Enter');
      if(route==='/admin/'||route==='/registry/'){
        await page.locator('#loginName').fill('01099990000');
        await page.locator('#loginPhone').fill('local-qa-only');
        await page.locator('#loginSecret').fill('5061');
        await page.locator('#loginSecret').press('Enter');
        await page.waitForSelector(route==='/admin/'?'#adminMain:not(.hidden)':'#main:not(.hidden)');
        if(route==='/registry/')await page.waitForFunction(()=>participantRows.length===2);
        await check(page,route+' authenticated '+width);
      }
      if(route==='/camera/'){
        await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('QA permission denied'));});
        await page.locator('#cameraBtn').click();
        await page.waitForFunction(()=>document.getElementById('status').textContent.includes('QA permission denied'));
        assert.equal(await page.locator('#cameraBtn').isEnabled(),true);
        await page.locator('#fileInputPhoto').setInputFiles(fileURLToPath(new URL('../public/assets/logos/kcac.8fc71deb554e.png',import.meta.url)));
        await page.waitForFunction(()=>document.getElementById('status').textContent.includes('불러오기 완료'));
        await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');
        await page.locator('#saveBtn').click();await page.locator('.thumb').click();
        assert.equal(await page.locator('#modal').evaluate(el=>el.classList.contains('on')),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#modal').evaluate(el=>el.classList.contains('on')),false);
        assert.equal(await page.locator('.thumb').evaluate(el=>el===document.activeElement),true);
        await check(page,'camera image flow '+width);
      }
      if(route==='/assessment/'||route==='/debriefing/'){
        await page.evaluate(()=>toast('1번 컵은 FAST Rosetta, 2번 컵은 SLOW Rosetta입니다. 입력한 점수와 기록은 각각 유지됩니다.'));
        const toastFits=await page.locator('#toast').evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().width<=innerWidth-16);
        assert.equal(toastFits,true,'long status messages must wrap within the mobile viewport');
        await page.evaluate(()=>document.getElementById('toast').classList.remove('show'));
      }
      await shot(page,(route.replaceAll('/','')||'home')+'-verified-'+width);
      await page.close();
    }
    const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;refreshParticipantAssignmentsForActiveComp_=()=>{};},api.actor);
    for(const code of codes)for(const round of ['예선','결선']){
      await page.evaluate(({code,round})=>{
        hideOverlay();_selComp={code,name:code,currentRound:round,isActive:true};
        if(code==='KCAC'){startKcac(round==='예선'?'':'pattern');document.getElementById('kcac-num').value='1';onKcacParticipantSelected_();}
        if(code==='KBC')startKbc();
        if(code==='MOB')startMob();
        if(code==='KCR')initCuppingEval([1,2],round+'평가','Blending',round==='결선',false,{id:'qa-1',label:'스테이션 1',start:1,end:2});
        if(code==='IKRC')initIkrcSamples(['A-1','A-2'],{id:'qa-1',label:'스테이션 1',prefix:'A',start:1,end:2});
        if(code==='MOC')initMocTargets([1,2]);
        if(code==='KTCC')initKtccTargets([{num:1,teamName:'QA 팀 1'},{num:2,teamName:'QA 팀 2'}]);
      },{code,round});
      if(code==='KCAC'&&round==='예선') {
        await page.locator('.kcac-milk-choice-btn').filter({hasText:'FAST Rosetta'}).click();
        assert.equal(await page.locator('#kcac-cup-nav .cup-btn').count(),2,'independent FAST and SLOW tabs');
        assert.equal(await page.locator('#kcac-cup-nav').getByText('종합코멘트',{exact:true}).isVisible(),true);
      }
      await check(page,code+round+width);
      if(code==='MOB'||code==='KCAC'){
        const clipping=await page.evaluate(()=>[...document.querySelectorAll('.eval-wrap.active .eval-total-val')].filter(e=>e.getClientRects().length).filter(e=>{
          let r=e.getBoundingClientRect();for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(['hidden','auto','scroll','clip'].includes(s.overflowX)){const b=p.getBoundingClientRect();if(r.left<b.left-1||r.right>b.right+1)return true;}}return false;
        }).map(e=>e.id));
        assert.deepEqual(clipping,[],code+' clipped score totals '+width);
      }
      if(code==='IKRC'||code==='KCR'){
        const prefix=code==='IKRC'?'ikrc':'cupping';
        const selector='#'+prefix+'-score-slider';
        await page.locator(selector).fill('3.4');
        await page.locator(selector).dispatchEvent('change');
        await page.locator('#'+prefix+'-lock-cb').check();
        const nav=page.locator('#'+prefix+'-cup-nav .cup-btn');
        await nav.nth(1).click();
        await nav.nth(0).click();
        assert.equal(await page.locator(selector).inputValue(),'3.4');
        assert.equal(await page.locator(selector).isDisabled(),true);
      }
      await shot(page,code+'-'+(round==='예선'?'prelim':'final')+'-verified-'+width);
    }
    await page.close({runBeforeUnload:false});
    console.log('Stage203 public pages, camera, authenticated registry and seven competitions passed at '+width+'px.');
  }

  // Delay responses deliberately to reproduce competition-switch races.
  const registry=await qa.page();
  await registry.goto(qa.origin+'/registry/');
  await registry.evaluate(actor=>{
    window.qaOriginalRpc=rpc;window.qaPending=[];
    rpc=(action,args,success,failure)=>qaPending.push({action,args,success,failure});
    window.actor=actor;document.getElementById('main').classList.remove('hidden');document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('comp').innerHTML='<option>KBC</option><option>MOB</option>';
    loadParticipants();loadSelectiveResetOptions();document.getElementById('comp').value='MOB';loadParticipants();loadSelectiveResetOptions();
    const rows=code=>[8,1].map(n=>({rowIndex:n,competitionCode:code,name:code+' 선수 '+n,uniqueNo:String(n),prelimCupNo:String(n)}));
    qaPending.find(x=>x.action==='listParticipants'&&x.args[0]==='MOB').success({success:true,participants:rows('MOB')});
    qaPending.find(x=>x.action==='getSelectiveResetOptions'&&x.args[0]==='MOB').success({success:true,participants:[{participantId:1,name:'MOB 선수'}],scoreTargets:[{round:'예선',unit:'1',rowCount:4}]});
    qaPending.find(x=>x.action==='listParticipants'&&x.args[0]==='KBC').success({success:true,participants:rows('KBC')});
    qaPending.find(x=>x.action==='getSelectiveResetOptions'&&x.args[0]==='KBC').success({success:true,participants:[{participantId:8,name:'KBC 선수'}],scoreTargets:[{round:'결선',unit:'8',rowCount:1}]});
  },api.actor);
  assert.doesNotMatch(await registry.locator('#partTable').innerText(),/KBC/);
  assert.match(await registry.locator('#selectiveParticipant').textContent(),/MOB 선수/);
  assert.equal(await registry.evaluate(()=>selectiveResetScores[0].unit),'1');
  assert.deepEqual(await registry.locator('#partTable td.cell-number').allTextContents(),['1','8']);
  await registry.evaluate(()=>{loadParticipants();qaPending.at(-1).success({success:false,message:'QA temporary error'});});
  assert.equal(await registry.evaluate(()=>participantRows.length),2,'a failed refresh must retain the current list');
  assert.match(await registry.locator('#manualMsg').innerText(),/QA temporary error/);
  await registry.evaluate(()=>{loadParticipants();loadParticipants();qaPending.at(-1).success({success:true,participants:[{rowIndex:3,competitionCode:'MOB',name:'최신 선수',uniqueNo:'3'}]});qaPending.at(-2).success({success:true,participants:[]});});
  assert.match(await registry.locator('#partTable').innerText(),/최신 선수/);
  await registry.evaluate(()=>{document.getElementById('comp').value='KBC';document.getElementById('selectiveScore').value='0';deleteSelectedScoreReset();});
  assert.equal(await registry.evaluate(()=>qaPending.some(x=>x.action==='deleteSelectedScoreData')),false,'stale destructive targets are blocked');
  await registry.evaluate(()=>{
    document.getElementById('comp').value='MOB';updateManualParticipantFields();
    document.getElementById('mName').value='저장할 선수';document.getElementById('mNo').value='12';saveOneParticipant();saveOneParticipant();
  });
  assert.equal(await registry.evaluate(()=>qaPending.filter(x=>x.action==='upsertParticipant').length),1,'repeated save sends one request');
  await registry.locator('#mName').fill('새로 입력한 선수');
  await registry.evaluate(()=>qaPending.find(x=>x.action==='upsertParticipant').success({success:true}));
  assert.equal(await registry.locator('#mName').inputValue(),'새로 입력한 선수','late save completion must not clear new edits');
  await check(registry,'registry out-of-order responses',{unnamed:false});
  await registry.close();

  // Authentication failure/retry and the bounded admin authority refresh.
  const auth=await qa.page();await auth.goto(qa.origin+'/assessment/');
  await auth.evaluate(()=>{
    window.qaCalls=[];
    function runner(ok,fail){return new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>runner(f,fail);if(k==='withFailureHandler')return f=>runner(ok,f);return (...args)=>qaCalls.push({action:k,args,ok,fail});}});}
    google.script.run=runner();
  });
  await auth.locator('#inp-name').fill('QA 심사위원');await auth.locator('#inp-phone').fill('01099990000');
  await auth.locator('#inp-phone').press('Enter');await auth.evaluate(()=>doLogin());
  assert.equal(await auth.evaluate(()=>qaCalls.filter(x=>x.action==='judgeLogin').length),1);
  await auth.evaluate(()=>qaCalls.find(x=>x.action==='judgeLogin').fail(new Error('QA login failure')));
  assert.equal(await auth.locator('#judge-login-button').isEnabled(),true);
  assert.equal(await auth.locator('#inp-name').inputValue(),'QA 심사위원');
  await auth.evaluate(actor=>{
    _judge=actor;loadAdminPanel();
    qaCalls.find(x=>x.action==='getAdminConsoleData').ok({success:false});
    qaCalls.find(x=>x.action==='refreshAdminActor').ok({success:true,actor});
    qaCalls.filter(x=>x.action==='getAdminConsoleData').at(-1).ok({success:false});
  },api.actor);
  assert.equal(await auth.evaluate(()=>qaCalls.filter(x=>x.action==='refreshAdminActor').length),1,'no endless authority-refresh loop');
  await auth.close();
  console.log('Stage203 race, stale-delete, save-preservation and login-retry checks passed. Views: '+checkedViews);
}finally{await qa.close();api.close();}
