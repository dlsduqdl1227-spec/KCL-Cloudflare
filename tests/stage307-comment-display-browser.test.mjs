import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

const original='오렌지가 첫인상을 이룹니다.  발효된 과일같은 향미가 느껴집니다.\n\n여운은 길게 남습니다... 원문 <img src=x onerror="window.qaInjected=true"> & 기록 끝';
const title='[안내] 로스팅 평가 점수 표기 차이 안내';
const paragraphs=['대회 당일 공지된 로스팅 평가 점수와 웹 심사 시스템상에 표기된 점수가 일부 다를 수 있습니다.','이는 시스템 입력 방식에 따른 차이로\n실제 대회장에서 0.5점 단위로 수기 시트지 심사가 진행되었으나,\n디브리핑용 웹 심사 시스템이 0.2점 단위(짝수 표기)만 지원하여\n0.5점이 0.4점으로 대체 환산되어 표기되었습니다.'];

test('all competition public/preview comments preserve exact authored text; IKRC notice is scoped, responsive and read-only',async()=>{
 const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle,pagesHeaders:true});
 fs.mkdirSync('tmp/stage307-qa',{recursive:true});
 try{
  for(const row of api.db.prepare('SELECT id,payload_json FROM scores').all()){
   const payload=JSON.parse(row.payload_json);for(const item of payload.rows||[])item.extraFields={...item.extraFields,'종합코멘트':original};
   api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
  }
  api.db.prepare('UPDATE competitions SET debriefing=1').run();
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const page=await qa.page(390,950);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
  for(const c of api.cases){
   const publicResponse=await api.publicView(c);assert.equal(publicResponse.success,true,c.code);
   for(const [i,round]of c.rounds.entries()){
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[i],round,api.actor);
    const publicRound={...publicResponse,scores:publicResponse.scores.filter(s=>s.round===round),rankInfos:publicResponse.rankInfos.filter(r=>r.round===round),rankInfo:publicResponse.rankInfos.find(r=>r.round===round)};
    let previewMarkup;
    for(const [mode,response]of [['preview',preview],['public',publicRound]]){
     await page.evaluate(response=>{renderResult(response);showPanel('pResult');},response);
     const comments=await page.locator('.score-card .comment-entry').filter({has:page.locator('.comment-label',{hasText:'Overall Comment'})}).locator('.comment-text').allInnerTexts();
     assert.ok(comments.length,c.code+' '+round+' '+mode+' has original comment');
     assert.ok(comments.every(text=>text===original),c.code+' '+round+' '+mode+' exact original, including particles and paragraphs');
     assert.equal(await page.evaluate(()=>window.qaInjected),undefined,'authored HTML must remain escaped');
     assert.equal(await page.locator('.comment-text img').count(),0);
     assert.equal(await page.locator('.ikrc-score-unit-note').count(),c.code==='IKRC'?1:0,c.code+' notice isolation');
     if(c.code==='IKRC'){
      assert.equal(await page.locator('.ikrc-score-unit-note h3').innerText(),title);
      assert.deepEqual(await page.locator('.ikrc-score-unit-note p').allTextContents(),paragraphs);
      for(const width of [320,390,768,1440]){
       await page.setViewportSize({width,height:950});assert.equal((await inspectPage(page)).pageOverflow,false);
       assert.deepEqual(await auditTextContrast(page,'.ikrc-score-unit-note'),[]);
       if(round==='결선'&&mode==='public'&&[390,1440].includes(width))await page.screenshot({path:'tmp/stage307-qa/IKRC-notice-'+width+'.png',fullPage:true});
      }
     }
     if(mode==='preview')previewMarkup=await page.locator('#res-body').innerHTML();
     else assert.equal(await page.locator('#res-body').innerHTML(),previewMarkup,c.code+' '+round+' same player/preview renderer');
    }
   }
  }
  await page.evaluate(res=>{renderResult(res);renderResult(res);},await api.publicView(api.cases.find(c=>c.code==='IKRC')));
  assert.equal(await page.locator('.ikrc-score-unit-note').count(),1,'refresh does not duplicate the notice');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'no saved score, tag or comment changes');
 }finally{await qa.close();api.close();}
});
