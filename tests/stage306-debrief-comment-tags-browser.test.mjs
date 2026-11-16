import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const longTag='단맛과질감의균형이길고일관되게유지되는특성을설명하는긴스마트태그';
const englishTag='BalancedSweetnessAndConsistentMouthfeelWithNoWhitespace'.repeat(2);
const authored='첫 문단: 향미 설명과 서비스의 흐름이 명확합니다.\n\n둘째 문단: 준비 순서를 정리하면 더 좋겠습니다.\n추가 참고: '+'LongReferenceWithoutWhitespace'.repeat(8);
const overall='종합 원문: 보완 지점은 피니시의 일관성입니다.\n\n플레이버에서 오렌지가 느껴졌습니다.\n'+authored+' OverallTailMarker';
function feedback(code,round){
 const tags=['의도 전달 명확',longTag,englishTag].join(', ');
 if(code==='KBC')return {'Service Professionalism(서비스의 전문성)':4.2,'Service Professionalism 스마트태그':tags,'Service Professionalism 코멘트':authored,'Espresso Flavor 코멘트':'에스프레소 향미 원문 유지','Signature Flavor 코멘트':'창작음료 향미 원문 유지','Espresso Flavor 스마트태그':tags,'Signature Flavor 스마트태그':tags,'Machine & Equipment Professionalism(머신 및 기물 운용 전문성)':4.4,'Machine & Equipment Professionalism 스마트태그':tags,'Machine & Equipment Professionalism 코멘트':'머신과 기물 운용 원문을 확인했습니다.\n다음 평가 항목도 보존합니다.'};
 if(code==='KCAC'){const prefix=round==='예선'?'예선 Pattern Completion(패턴 완성도)':'결선 Theme Expression(주제 표현력)';return {[prefix]:4,[prefix+' 스마트태그']:tags,[prefix+' 코멘트']:authored};}
 if(code==='MOB')return {'Sweetness(스윗니스)':4,'Sweetness 스마트태그':tags,'Sweetness 코멘트':authored,'Flavor 코멘트':'브루잉 향미 원문 유지',...(round==='결선'?{'메뉴':'창작','Creative Flavor 코멘트':'창작음료 향미 원문 유지','Creative Flavor 스마트태그':tags}:{})};
 if(['KCR','IKRC'].includes(code))return {'Flavor(플레이버)':4,'Flavor 스마트태그':tags,'Flavor 코멘트':authored,'종합코멘트':overall,...(code==='KCR'?{'Aftertaste Flavor Reference 스마트태그':tags}:{})};
 return {'종합코멘트':authored,'평가 스마트태그':tags};
}

test('all seven debriefs keep long tags and authored paragraphs readable in public/preview mobile, tablet and desktop layouts',async()=>{
 const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
 fs.mkdirSync('tmp/stage306-qa',{recursive:true});
 try{
  for(const row of api.db.prepare('SELECT id,competition_code,round,payload_json FROM scores').all()){
   const payload=JSON.parse(row.payload_json);for(const item of payload.rows||[])item.extraFields={...item.extraFields,...feedback(row.competition_code,row.round)};
   api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
  }
  api.db.prepare('UPDATE competitions SET debriefing=1').run();
  const stored=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),views=[];
  for(const c of api.cases){
   const publicResponse=await api.publicView(c);assert.equal(publicResponse.success,true);views.push({code:c.code,mode:'public',response:publicResponse});
   for(const [i,round]of c.rounds.entries())views.push({code:c.code,mode:'preview-'+round,response:await api.rpc('getAdminDebriefPreview',c.code,c.units[i],round,api.actor)});
  }
  for(const width of [320,375,390,430,600,768,844,1024,1440]){
   const page=await qa.page(width,900);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
   for(const view of views){
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},view.response);
    const result=await page.evaluate(()=>{
     const problems=[],root=document.getElementById('res-body');
     if(document.getElementById('pResult').getBoundingClientRect().width>Math.min(innerWidth,920)+1)problems.push('report exceeds readable desktop width');
     for(const el of root.querySelectorAll('.smart-tag-box,.smart-tag-row,.smart-tag-label,.smart-tag-chips,.smart-tag-chip,.comment-box,.comment-entry,.comment-label,.comment-text')){
      const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
      if(el.scrollWidth>el.clientWidth+2)problems.push(el.className+': clipped content');
      const parent=el.parentElement.getBoundingClientRect();if(r.left<parent.left-1||r.right>parent.right+1)problems.push(el.className+': outside parent');
      if(el.matches('.smart-tag-chip')&&el.textContent.length>30&&r.width<Math.min(130,parent.width)-1)problems.push('long tag squeezed into a narrow column');
     }
     for(const row of root.querySelectorAll('.smart-tag-row')){
      const label=row.querySelector('.smart-tag-label').getBoundingClientRect(),chips=row.querySelector('.smart-tag-chips').getBoundingClientRect();
      if(chips.top<label.bottom-1&&chips.left<label.right-1)problems.push('label overlaps tags');
      if(innerWidth<600&&chips.top<label.bottom-1)problems.push('mobile tags must start below their heading');
     }
     const paragraphs=[...root.querySelectorAll('.comment-entry .comment-text')].filter(el=>el.textContent.includes('첫 문단:'));
     for(const el of paragraphs)if(!['pre-wrap','pre-line','break-spaces'].includes(getComputedStyle(el).whiteSpace)||!el.innerText.includes('\n\n둘째 문단:'))problems.push('authored paragraph breaks lost: '+getComputedStyle(el).whiteSpace+' '+JSON.stringify(el.textContent.slice(0,130)));
     return {problems,tags:root.querySelectorAll('.smart-tag-chip').length,paragraphs:paragraphs.length};
    });
    const context=view.code+' '+view.mode+' '+width+'px';
    const visibleText=await page.locator('#res-body').innerText();
    if(view.code==='KBC'){assert.ok(visibleText.includes('에스프레소 향미 원문 유지'),context);if(view.response.scores.some(s=>(s.round||s['라운드'])!=='예선'))assert.ok(visibleText.includes('창작음료 향미 원문 유지'),context);}
    if(view.code==='MOB'&&view.response.scores.some(s=>s.round==='결선'||s['라운드']==='결선'))assert.ok(visibleText.includes('창작음료 향미 원문 유지'),context);
    if(['KCR','IKRC'].includes(view.code)){const originals=await page.locator('.comment-entry').filter({has:page.locator('.comment-label',{hasText:'Overall Comment'})}).locator('.comment-text').allTextContents();assert.ok(originals.some(text=>text===overall.replaceAll('\n','')),context+' exact overall comment preserved');}
    if(view.code==='KBC'&&view.mode==='preview-결선'&&[320,390,768,1440].includes(width))await page.locator('.score-card').first().screenshot({path:'tmp/stage306-qa/KBC-'+width+'.png'});
    assert.deepEqual(result.problems,[],context);assert.ok(result.tags>0,context+' tags');assert.ok(result.paragraphs>0,context+' paragraphs');
    assert.equal((await inspectPage(page)).pageOverflow,false,context);
   }
   assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
   console.log('Seven competitions, all rounds, public/preview feedback geometry passed at '+width+'px');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),stored);
 }finally{await qa.close();api.close();}
});
