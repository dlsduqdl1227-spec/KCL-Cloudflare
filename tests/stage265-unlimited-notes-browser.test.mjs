import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const qa=await createBrowserFixture();
fs.mkdirSync('tmp/stage265-qa',{recursive:true});
const notes=Array.from({length:9},(_,i)=>'관찰 표현 '+(i+1)).concat('긴 향미 표현을 단어 수나 글자 수로 자르지 않고 그대로 보존합니다. '.repeat(5));
async function addNotes(page,scope){
  await page.locator(scope+' .kcl-tag-launch').first().click();
  const input=page.locator('#kcl-smart-tag-picker .kcl-tag-picker-custom input');
  assert.equal(await input.getAttribute('maxlength'),null);
  for(const note of notes){await input.fill(note);await input.press('Enter');}
  const selected=await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-selected').innerText();
  for(const note of notes)assert.ok(selected.includes(note.trim()));
  assert.doesNotMatch(await page.locator('#kcl-smart-tag-picker').innerText(),/최대 [35]개/);
  await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-done').click();
}
try{
 for(const width of [320,390,1440]){
  const page=await qa.page(width,950);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(()=>{_judge={name:'QA',type:'ADMIN',accountType:'ADMIN',judgeToken:'local'};refreshParticipantAssignmentsForActiveComp_=()=>{};kclMaybeRestoreDraftForActiveEval_=()=>{};_selComp={code:'KCR',name:'KCR',currentRound:'결선',isActive:true};initCuppingEval([201,202],'결선평가','Blending',true,false,{id:'qa',label:'스테이션 1',start:201,end:202});});
  await addNotes(page,'#cupping-attr-card');
  const flavor=await page.evaluate(()=>_cupping.cups[0].flavorTagIds);
  assert.equal(flavor.length,10);
  await page.evaluate(()=>switchCuppingAttr('mouthfeel'));
  await addNotes(page,'#cupping-attr-card');
  assert.equal(await page.evaluate(()=>_cupping.cups[0].mouthfeelTagIds.length),10);
  await page.evaluate(()=>switchCuppingAttr('aftertaste'));
  await addNotes(page,'#cupping-attr-card');
  await page.evaluate(()=>{for(const id of _cupping.cups[0].flavorTagIds)toggleKcrAftertasteFlavorTag('aftertaste',id);});
  assert.equal(await page.evaluate(()=>_cupping.cups[0].aftertasteFlavorTagIds.length+_cupping.cups[0].aftertasteTagIds.length),20);
  await page.evaluate(()=>{switchCuppingCup(1);switchCuppingCup(0);});
  assert.deepEqual(await page.evaluate(()=>_cupping.cups[0].flavorTagIds),flavor);
  assert.equal(await page.evaluate(()=>_cupping.cups[1].flavorTagIds.length),0);
  await page.evaluate(()=>{hideEval();_selComp={code:'KBC',name:'KBC',currentRound:'본선'};startKbc();});
  await addNotes(page,'#evalKbc');
  const kbc=await page.evaluate(()=>kbcCollectTagPayload_());
  assert.equal(kbc.service['Service Professionalism'].length,10);
  await page.evaluate(()=>{kbcToggleTagValue_('espresso','Espresso Flavor','견과·코코아 계열');kbcToggleTagValue_('espresso','Espresso Flavor','견과·코코아 계열 > 아몬드');});
  assert.equal(await page.evaluate(()=>kbcCollectTagPayload_().espresso['Espresso Flavor'].length),2,'adding a specific expression retains a selected family');
  await page.screenshot({path:`tmp/stage265-qa/notes-${width}.png`});
  await page.evaluate(()=>{hideEval();_selComp={code:'MOB',name:'MOB',currentRound:'예선'};startMob();});
  await addNotes(page,'#evalMob');
  assert.equal(await page.evaluate(()=>Math.max(...Object.values(mobCollectTagPayload_()).flatMap(group=>Object.values(group).map(tags=>tags.length)))),10);
  await page.evaluate(()=>{hideEval();_selComp={code:'IKRC',name:'IKRC',currentRound:'결선'};initIkrcSamples(['A-1','A-2'],{id:'qa-i',label:'QA',prefix:'A',start:1,end:2});});
  await addNotes(page,'#evalIkrc');
  assert.equal(await page.evaluate(()=>_ikrcSamples[0].selectedTagsFlavor.length),10);
  const result=await inspectPage(page);assert.equal(result.pageOverflow,false);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close({runBeforeUnload:false});
 }
}finally{await qa.close();}
console.log('Stage265 unlimited 10 notes/long wording across KCR/KBC/MOB/IKRC, 20 Aftertaste observations, family coexistence, per-cup preservation and mobile layout passed.');
