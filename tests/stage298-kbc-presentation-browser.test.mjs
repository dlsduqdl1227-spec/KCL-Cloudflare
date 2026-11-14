import test from 'node:test';
import assert from 'node:assert/strict';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
test('KBC presentation score, tags and authored comments appear in every round and preview/public mode at mobile and desktop widths',async()=>{
  const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});try{
    for(const row of api.db.prepare("SELECT id,payload_json FROM scores WHERE competition_code='KBC'").all()){
      const payload=JSON.parse(row.payload_json);payload.rows[0].extraFields={...payload.rows[0].extraFields,'Service Professionalism(서비스의 전문성)':4.2,'Service Professionalism 코멘트':'직접 작성한 프레젠테이션 의견 보존','Service Professionalism 스마트태그':'의도 전달 명확','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)':4.4,'Machine & Equipment Professionalism 코멘트':'머신 운용 원문 평가','Machine & Equipment Professionalism 스마트태그':'기물 운용 숙련'};api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
    }
    const original=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),c=api.cases.find(c=>c.code==='KBC');
    for(const width of [390,1440]){
      const page=await qa.page(width);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
      for(const [index,round] of c.rounds.entries()){
        const response=await api.rpc('getAdminDebriefPreview','KBC',c.units[index],round,api.actor);
        for(const isAdminPreview of [true,false]){
          await page.evaluate(res=>{renderResult(res);showPanel('pResult');},{...response,isAdminPreview});
          const item=page.locator('.score-item').filter({hasText:'프레젠테이션·서비스 전문성'}).first();assert.equal(await item.isVisible(),true);assert.match(await item.innerText(),/4\.2/);
          assert.match(await page.locator('#res-body').innerText(),/직접 작성한 프레젠테이션 의견 보존/);assert.match(await page.locator('#res-body').innerText(),/의도 전달 명확/);
          const machine=page.locator('.score-item').filter({hasText:'머신 및 기물 운용 전문성'}).first();assert.equal(await machine.isVisible(),true);assert.match(await machine.innerText(),/4\.4/);assert.match(await page.locator('#res-body').innerText(),/머신 운용 원문 평가/);
          assert.doesNotMatch(await page.locator('#res-body').innerText(),/QA 심사/);assert.equal((await inspectPage(page)).pageOverflow,false);
        }
      }
      assert.deepEqual(page.qaErrors,[]);await page.close();
    }
    assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original);
  }finally{await qa.close();api.close();}
});
