import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
try{
 for(let i=1;i<=2;i++)await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'일괄 심사 '+i,phone:'0108999000'+i,access:'KBC',role:'센서리 심사위원',teamGroup:i===1?'A조':'B조',effectiveDate:'2026-11-12'},api.actor);
 const page=await qa.page(390,950);await page.goto(qa.origin+'/registry/');
 await page.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);
 await page.waitForFunction(()=>operatorRows.length>=2);
 await page.locator('#tabbtn-operators').click();
 await page.locator('#operatorSelectAll').check();await page.locator('#bulkOperatorDate').fill('2026-11-13');
 await page.getByRole('button',{name:'선택 계정 날짜 변경',exact:true}).click();
 assert.match(await page.locator('#bulkOperatorConfirm').innerText(),/2건/);
 let response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='bulkUpdateOperatorAssignments');
 await page.locator('#bulkOperatorConfirm').getByRole('button',{name:'변경 적용'}).click();assert.equal((await(await response).json()).success,true);
 await page.waitForFunction(()=>operatorRows.filter(r=>r.access==='KBC').every(r=>r.effectiveDate==='2026-11-13'));
 await page.locator('#operatorSelectAll').check();await page.getByRole('button',{name:'선택 계정 조 배정 해제',exact:true}).click();
 response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='bulkUpdateOperatorAssignments');await page.locator('#bulkOperatorConfirm').getByRole('button',{name:'변경 적용'}).click();assert.equal((await(await response).json()).success,true);
 await page.waitForFunction(()=>operatorRows.filter(r=>r.access==='KBC').every(r=>r.teamGroup===''));
 assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(page.qaErrors,[]);
 console.log('Stage269 browser: mobile multi-select date change and team release, inline confirmation and updated roster passed.');
}finally{await qa.close();api.close();}
