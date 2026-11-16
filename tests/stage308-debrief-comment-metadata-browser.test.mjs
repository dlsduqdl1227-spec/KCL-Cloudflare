import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCommentMetadataFixture,commentMetadata,authoredComment} from './helpers/debrief-comment-metadata-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

test('fresh and stale debrief responses never render AI-use flags as feedback in any competition or round',async()=>{
 const api=await createCommentMetadataFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
 fs.mkdirSync('tmp/stage308-qa',{recursive:true});
 try{
  const stored=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),page=await qa.page(390,900);
  await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
  for(const c of api.cases)for(const [index,round]of c.rounds.entries()){
   const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[index],round,api.actor);
   for(const stale of [false,true]){
    const res=stale?{...preview,scores:preview.scores.map(score=>({...score,...commentMetadata}))}:preview;
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},res);
    const text=await page.locator('#res-body').innerText();
    assert.doesNotMatch(text,/AI 자동 생성|자동 생성 사용 안 함|INTERNAL_(?:GENERATION_STATE|COMMENT_STATE|COMMENT_SOURCE|COMMENT_MODE)/,c.code+' '+round+' '+stale);
    assert.ok(text.includes(authoredComment),c.code+' original comment remains');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal((await inspectPage(page)).pageOverflow,false);}
    if(c.code==='KBC'&&round==='결선'&&stale){await page.setViewportSize({width:390,height:900});await page.locator('.comment-box').first().screenshot({path:'tmp/stage308-qa/KBC-comments-390.png'});}
   }
  }
  const retained=await page.evaluate(()=>{var box=buildCommentBox({'종합코멘트':'AI라는 단어가 있는 실제 심사 의견도 원문은 보존합니다.'},'KBC');return box.textContent;});
  assert.ok(retained.includes('AI라는 단어가 있는 실제 심사 의견도 원문은 보존합니다.'),'filter field names, never blanket-delete authored text');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),stored);
 }finally{await qa.close();api.close();}
});
