import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage242-qa',{recursive:true});
try {
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const width of [320,390,768,1440]) {
    const page=await qa.page(width);
    await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
    for(const c of api.cases) {
      const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor);
      const sample=preview.scores[0];
      const make=(id,judge,role,round='예선')=>({...sample,scoreRowId:id,'심사위원명':judge,judgeName:judge,'역할':role,round,'라운드':round,'총점':23.4,'종합코멘트':'그대로 유지할 평가 기록'});
      const result={...preview,scores:[make(1,'비공개 이름 A','센서리 심사위원'),make(2,'비공개 이름 T','테크니컬 심사위원'),make(3,'비공개 이름 B','센서리 헤드 심사위원'),make(4,'비공개 이름 C','Sensory judge'),make(5,'비공개 이름 A','센서리 심사위원'),make(6,'비공개 이름 B','센서리 심사위원','결선')]};
      await page.evaluate(res=>{renderResult(res);showPanel('pResult');},result);
      const titles=await page.locator('.score-card .judge-name').evaluateAll(els=>els.map(el=>el.firstChild.textContent));
      if(!['KCAC','KTCC'].includes(c.code))assert.deepEqual(titles,['1번 센서리심사위원 평가','테크니컬 평가 결과','2번 센서리심사위원 평가','3번 센서리심사위원 평가','1번 센서리심사위원 평가','1번 센서리심사위원 평가'],c.code+' independent round numbering, no technical offset, same judge keeps number');
      if(c.code==='KCAC')assert.ok(titles.every(t=>/번 심사위원 라떼아트 평가/.test(t)));
      if(c.code==='KTCC')assert.ok(titles.every(t=>!t.includes('센서리심사위원')));
      assert.doesNotMatch(await page.locator('#res-body').innerText(),/비공개 이름/,'judge names stay out of rendered report');
      assert.deepEqual(await page.locator('.score-card .total-score').allTextContents(),Array(6).fill(c.code==='IKRC'?'개별 평가 점수23.4':c.code==='MOB'?'평가 반영 점수23.4':'23.4'));
      const previewMarkup=await page.locator('#res-body').innerHTML();
      await page.evaluate(res=>renderResult({...res,isAdminPreview:false}),result);
      assert.equal(await page.locator('#res-body').innerHTML(),previewMarkup,'same labels/content in public and preview');
      const inspected=await inspectPage(page);assert.equal(inspected.pageOverflow,false,c.code+' '+width);assert.deepEqual(page.qaErrors,[]);
      const fits=await page.locator('.score-card-header').evaluateAll(headers=>headers.every(header=>{const [title,total]=header.children,a=title.getBoundingClientRect(),b=total.getBoundingClientRect();return a.right<=b.left+1&&b.right<=header.getBoundingClientRect().right+1;}));
      assert.ok(fits,c.code+' heading and score do not overlap at '+width);
      const singleLine=await page.locator('.score-card .total-score').evaluateAll(totals=>totals.every(total=>{const range=document.createRange();range.selectNodeContents(total.lastChild);return range.getClientRects().length===1;}));
      assert.ok(singleLine,c.code+' numeric total stays on one line at '+width);
      if(c.code==='KCR'&&[320,1440].includes(width))await page.locator('.score-card').first().screenshot({path:`tmp/stage242-qa/KCR-${width}.png`});
    }
    // Old anonymous rows still receive distinct numbers and re-render predictably.
    const legacy={competition:'KCR',playerInfo:{name:'QA'},scores:[{round:'예선',역할:'센서리 심사위원',총점:21},{round:'예선',역할:'센서리 심사위원',총점:22}]};
    await page.evaluate(res=>renderResult(res),legacy);
    assert.deepEqual(await page.locator('.score-card .judge-name').allTextContents(),['1번 센서리심사위원 평가','2번 센서리심사위원 평가']);
    await page.evaluate(res=>renderResult(res),legacy);
    assert.deepEqual(await page.locator('.score-card .judge-name').allTextContents(),['1번 센서리심사위원 평가','2번 센서리심사위원 평가']);
    await page.close();console.log('Stage242 all competitions: numbered sensory titles, private identities, round reset, unchanged totals, preview parity and layout passed at '+width+'px.');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'display changes never alter saved scores/comments');
} finally {await qa.close();api.close();}
