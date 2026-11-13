import test from 'node:test';
import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {reverseRequestedKbcFinalOrder,KBC_FINAL_ORDER_KEY} from '../lib/kbc-final-order-20261113.mjs';
const rows=api=>api.db.prepare('SELECT * FROM participants ORDER BY id').all();
const snapshot=api=>JSON.stringify(rows(api));
const receipt=api=>api.db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(KBC_FINAL_ORDER_KEY);
async function seed(api,choPosition=6){
  for(let i=1;i<=6;i++)await api.rpc('upsertParticipant',{competitionCode:'KBC',name:i===choPosition?'QA 첫 시연자':'결선 선수 '+i,uniqueNo:String(i+100),prelimCupNo:String(i+200),mainCupNo:String(i+10),finalCupNo:String(i),extra:{note:'개별 메모 '+i,roundSchedules:{예선:{date:'2026-08-06'},본선:{order:i+10},결선:{order:i,date:'2026-11-14',day:'1',preparationTime:'준비 '+i,performanceTime:'시연 '+i,customNote:'선수 고유 '+i}}}},api.actor);
  await api.rpc('upsertParticipant',{competitionCode:'KBC',name:'본선만 선수',mainCupNo:'77'},api.actor);
  await api.rpc('upsertParticipant',{competitionCode:'MOC',name:'보존 선수',finalCupNo:'1'},api.actor);
  api.db.prepare("INSERT INTO scores(competition_code,round,unit,participant_name,total_score,payload_json,submitted_at) VALUES('KBC','결선','6','QA 첫 시연자',88.5,'{}','2026-11-13')").run();
}
test('KBC reverses existing performers and moves the requested anchor into the first existing time slot without renumbering or score edits',async()=>{
  const api=await createRpcFixture();try{
    await seed(api);const before=rows(api),scores=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
    assert.equal(await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자'),true);
    const after=rows(api),finalists=after.filter(r=>r.competition_code==='KBC'&&r.final_cup_no).sort((a,b)=>JSON.parse(a.extra_json).roundSchedules.결선.order-JSON.parse(b.extra_json).roundSchedules.결선.order);
    assert.deepEqual(finalists.map(r=>r.name),['QA 첫 시연자','결선 선수 5','결선 선수 4','결선 선수 3','결선 선수 2','결선 선수 1']);
    assert.deepEqual(finalists.map(r=>r.final_cup_no),['6','5','4','3','2','1']);
    for(const [i,row] of finalists.entries()){
      const old=before.find(r=>r.id===row.id),ex=JSON.parse(row.extra_json),oldEx=JSON.parse(old.extra_json);
      assert.equal(ex.roundSchedules.결선.performanceTime,'시연 '+(i+1));assert.equal(ex.roundSchedules.결선.preparationTime,'준비 '+(i+1));
      assert.equal(ex.roundSchedules.결선.customNote,oldEx.roundSchedules.결선.customNote);assert.equal(ex.note,oldEx.note);assert.deepEqual(ex.roundSchedules.본선,oldEx.roundSchedules.본선);
      const {extra_json,updated_at,...rest}=row,{extra_json:x,updated_at:y,...oldRest}=old;assert.deepEqual(rest,oldRest);
    }
    for(const old of before.filter(r=>r.competition_code!=='KBC'||!r.final_cup_no))assert.deepEqual(after.find(r=>r.id===old.id),old);
    assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),scores);assert.equal(JSON.parse(receipt(api).setting_value).changes.length,6);
  }finally{api.close();}
});
test('an already-correct anchor-first order is not reversed again',async()=>{
  const api=await createRpcFixture();try{await seed(api,1);assert.equal(await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자'),true);const data=rows(api).filter(r=>r.competition_code==='KBC'&&r.final_cup_no);assert.equal(data.find(r=>r.name==='QA 첫 시연자').final_cup_no,'1');assert.equal(JSON.parse(data.find(r=>r.name==='QA 첫 시연자').extra_json).roundSchedules.결선.order,1);}finally{api.close();}
});
for(const scenario of ['incomplete','anchor_in_middle'])test('KBC order is left intact for '+scenario,async()=>{
  const api=await createRpcFixture();try{await seed(api,scenario==='anchor_in_middle'?3:6);if(scenario==='incomplete')api.db.prepare("UPDATE participants SET final_cup_no='' WHERE competition_code='KBC' AND final_cup_no='1'").run();const before=snapshot(api);assert.equal(await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자'),false);assert.equal(snapshot(api),before);assert.equal(receipt(api),undefined);}finally{api.close();}
});
test('a concurrent KBC schedule edit blocks the entire reversal',async()=>{
  let change=null;const api=await createRpcFixture({beforeBatch:()=>{if(change){change();change=null;}}});try{
    await seed(api);change=()=>api.db.prepare("UPDATE participants SET extra_json=json_set(extra_json,'$.note','새 운영자 메모') WHERE competition_code='KBC' AND final_cup_no='6'").run();
    assert.equal(await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자'),false);assert.equal(receipt(api),undefined);assert.ok(rows(api).filter(r=>r.competition_code==='KBC'&&r.final_cup_no).every(r=>JSON.parse(r.extra_json).roundSchedules.결선.order===Number(r.final_cup_no)));
  }finally{api.close();}
});
test('completed KBC correction preserves later manual order changes',async()=>{
  const api=await createRpcFixture();try{await seed(api);await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자');api.db.prepare("UPDATE participants SET extra_json=json_set(extra_json,'$.roundSchedules.결선.order',9) WHERE competition_code='KBC' AND final_cup_no='6'").run();const before=snapshot(api);assert.equal(await reverseRequestedKbcFinalOrder(api.env.DB,'QA 첫 시연자'),true);assert.equal(snapshot(api),before);}finally{api.close();}
});
