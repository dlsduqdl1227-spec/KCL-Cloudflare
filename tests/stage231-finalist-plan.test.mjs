import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {buildFinalistPlan} from '../maintenance/finalist-plan.mjs';
const api=await createRpcFixture();
try{
 const codes=['MOC','KBC','KCAC','KTCC','IKRC','MOB'];
 for(const code of codes)for(let i=1;i<=2;i++)await api.rpc('upsertParticipant',{competitionCode:code,name:'같은 이름'+i,affiliation:'등록 소속',phone:'0107777000'+i,uniqueNo:String(i),prelimCupNo:String(i),extra:{notes:'보존',ikrcBlindAssignments:{예선:'A-'+i},'대회일':'2026-08-06',roundSchedules:{예선:{date:'2026-08-06'}}}},api.actor);
 const before=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
 const selections=before.filter(p=>p.prelim_cup_no==='2').map(p=>({id:p.id,code:p.competition_code,round:['MOC','KBC'].includes(p.competition_code)?'본선':'결선',rank:1,name:p.name,affiliation:p.affiliation}));
 const options={numbering:'rank',source:'QA',timestamp:'2026-10-14T00:00:00Z'};
 const {sql,plan}=buildFinalistPlan(before,selections,options);assert.equal(plan.length,6);
 // A concurrent admin edit aborts ALL six assignments.
 api.db.prepare('UPDATE participants SET updated_at=? WHERE id=?').run('concurrent',selections[0].id);
 api.db.exec(sql);assert.equal(api.db.prepare("SELECT COUNT(*) n FROM participants WHERE main_cup_no<>'' OR final_cup_no<>''").get().n,0);
 api.db.prepare('UPDATE participants SET updated_at=? WHERE id=?').run(before.find(r=>r.id===selections[0].id).updated_at,selections[0].id);
 api.db.exec(sql);
 for(const old of before){
  const row=api.db.prepare('SELECT * FROM participants WHERE id=?').get(old.id);
  if(old.prelim_cup_no==='1'){assert.deepEqual(row,old);continue;}
  for(const key of Object.keys(old).filter(k=>!['main_cup_no','final_cup_no','updated_at','extra_json'].includes(k)))assert.equal(row[key],old[key],key+' preserved');
  const round=['MOC','KBC'].includes(old.competition_code)?'본선':'결선';
  assert.equal(row[round==='본선'?'main_cup_no':'final_cup_no'],'1');
  const extra=JSON.parse(row.extra_json);assert.equal(extra.notes,'보존');assert.equal(extra.ikrcBlindAssignments.예선,'A-2');assert.equal(extra.roundSchedules[round].date,'');
  assert.equal(extra.roundSchedules.예선.date,'2026-08-06');
 }
 const after=api.db.prepare('SELECT * FROM participants ORDER BY id').all();api.db.exec(sql);assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(),after,'retry cannot overwrite new data');
 assert.throws(()=>buildFinalistPlan(before,[...selections,selections[0]],options),/중복/);
 assert.throws(()=>buildFinalistPlan(before,selections,{...options,numbering:''}),/배정 기준/);
 // A newly-started final must also block stale assignment plans.
 api.db.exec('DELETE FROM participants');
 const columns=Object.keys(before[0]);const insert=api.db.prepare(`INSERT INTO participants(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
 for(const row of before)insert.run(...columns.map(k=>row[k]));
 api.db.prepare("INSERT INTO scores(competition_code,round,unit,submitted_at,payload_json) VALUES('MOC','본선','1','2026-10-14','{}')").run();
 api.db.exec(sql);assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(),before);
 console.log('Stage231 atomic finalist assignment, same-name competition isolation, exact round, blank dates, no score import, preserved prelim/contact data and stale-plan guards passed.');
}finally{api.close();}
