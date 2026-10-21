import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const qa=await createBrowserFixture();fs.mkdirSync('tmp/stage260-qa',{recursive:true});
async function custom(page,scope,label){
 await page.locator(scope+' .kcl-tag-launch').first().click();
 const input=page.locator('#kcl-smart-tag-picker .kcl-tag-picker-custom input');
 await input.fill(label);await input.press('Enter');
 assert.match(await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-selected').innerText(),new RegExp(label));
 await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-done').click();
 assert.equal(await page.locator(scope+' .custom-tag-row').first().isVisible(),false);
 assert.equal(await page.locator(scope+' .kcl-tag-fallback').first().isVisible(),false);
}
async function vertical(page,selector){const boxes=await page.locator(selector).evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,align:getComputedStyle(e).textAlign}}));for(let i=0;i<boxes.length;i++){assert.equal(boxes[i].align,'center');assert.ok(boxes[i].height>=44);if(i){assert.ok(boxes[i].y>=boxes[i-1].y+boxes[i-1].height);assert.equal(boxes[i].x,boxes[0].x);}}}
try{
 for(const width of [320,390,768,1440]){
  const page=await qa.page(width,844);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(()=>{_judge={name:'QA',type:'ADMIN',accountType:'ADMIN',judgeToken:'local'};refreshParticipantAssignmentsForActiveComp_=()=>{};kclMaybeRestoreDraftForActiveEval_=()=>{};_selComp={code:'KCR',name:'KCR',currentRound:'결선',isActive:true};initCuppingEval([201,202],'결선평가','Blending',true,false,{id:'qa',label:'스테이션 1',start:201,end:202});renderLogoSlots();});
  await vertical(page,'#cupping-attr-tabs .attr-tab');
  assert.equal(await page.locator('#evalCupping [data-comp-logo=KCR]').count(),1);
  assert.equal(await page.locator('#evalCupping .eval-header img').evaluate(el=>el.complete&&el.naturalWidth>0),true);
  await page.locator('#kcr-sensory-comment-flavor').fill('직접 쓴 원문 유지');
  const peer=await page.evaluate(()=>JSON.stringify(_cupping.cups[1]));
  await custom(page,'#cupping-attr-card','귤껍질, 꽃향');
  assert.equal(await page.locator('#kcr-sensory-comment-flavor').inputValue(),'직접 쓴 원문 유지');
  const id=await page.evaluate(()=>_cupping.cups[0].flavorTagIds[0]);assert.ok(!id.includes(','));
  assert.deepEqual(await page.evaluate(id=>KcrSensoryTags.labels(JSON.parse(JSON.stringify([id]))),id),['귤껍질, 꽃향']);
  await page.locator('#cupping-next-cup').click();await page.locator('#cupping-previous-cup').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(_cupping.cups[1])),peer);
  assert.equal(await page.evaluate(()=>_cupping.cups[0].flavorTagIds[0]),id);
  await page.screenshot({path:`tmp/stage260-qa/kcr-${width}.png`});
  await page.evaluate(()=>{hideEval();_selComp={code:'KBC',name:'KBC',currentRound:'예선'};startKbc();});
  await custom(page,'#evalKbc','직접 기록 향미');
  assert.match(await page.evaluate(()=>JSON.stringify(kbcCollectTagPayload_())),/직접 기록 향미/);
  await page.evaluate(()=>{hideEval();_selComp={code:'MOB',name:'MOB',currentRound:'예선'};startMob();});
  await custom(page,'#evalMob','은은한 꽃향');
  assert.equal((await inspectPage(page)).pageOverflow,false);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
 }
}finally{await qa.close();}
console.log('Stage260: centered single-column attributes, compact logo, KCR/KBC/MOB direct tags, cup isolation and 320/390/768/1440px passed.');
