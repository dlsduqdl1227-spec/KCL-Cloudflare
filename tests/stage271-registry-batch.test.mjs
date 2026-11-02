import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
let race=null;
const api=await createRpcFixture({beforeBatch:async()=>{if(race){const run=race;race=null;run();}}});
const reject=async(action,...args)=>(await(await api.handle({action,args})).json());
const players=async()=>(await api.rpc('listParticipants','KBC',api.actor)).participants;
const operators=async()=>(await api.rpc('listOperators','ALL',api.actor)).operators;
function payload(target,operation,rows,updates={},code='KBC',round='예선'){return {target,operation,competitionCode:code,round,entries:rows.map(row=>({rowIndex:row.rowIndex,version:row.registryVersion,updates:typeof updates==='function'?updates(row):updates}))};}
async function apply(body){const plan=await api.rpc('previewRegistryBatch',body,api.actor);assert.equal(plan.ready,true,JSON.stringify(plan));return api.rpc('applyRegistryBatch',{...body,revision:plan.revision},api.actor);}
try{
 for(let i=1;i<=3;i++)await api.rpc('upsertParticipant',{competitionCode:'KBC',name:'선수 '+i,affiliation:'원래 소속',phone:'0108300000'+i,uniqueNo:'원본'+i,prelimCupNo:String(i),finalCupNo:String(i),extra:{memo:'보존',roundSchedules:{예선:{date:'2026-08-19'},결선:{date:'2026-11-14',preparationTime:'10:00~10:15',order:i}}}},api.actor);
 await api.rpc('upsertParticipant',{competitionCode:'MOB',name:'다른 대회',uniqueNo:'다른1',prelimCupNo:'1'},api.actor);
 api.db.prepare("INSERT INTO scores(submitted_at,competition_code,round,unit,participant_name,total_score,payload_json) VALUES('original','KBC','예선','1','선수 1',24.2,?)").run(JSON.stringify({comment:'절대 보존',tags:['원본 태그']}));
 const originalScores=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
 let rows=await players();
 const batch=payload('participants','edit',rows.slice(0,2),{affiliation:'수정 소속',date:'2026-11-15'},'KBC','결선');
 await apply(batch);rows=await players();assert.equal(rows[0].affiliation,'수정 소속');assert.equal(rows[0].extra.roundSchedules.예선.date,'2026-08-19');assert.equal(rows[0].extra.roundSchedules.결선.date,'2026-11-15');assert.equal(rows[0].extra.roundSchedules.결선.preparationTime,'10:00~10:15');assert.equal(rows[0].uniqueNo,'원본1');
 assert.equal((await reject('previewRegistryBatch',batch,api.actor)).stale,true);
 let plan=await api.rpc('previewRegistryBatch',payload('participants','edit',[rows[0]],{number:'7'}),api.actor);assert.equal(plan.ready,false);assert.match(plan.errors[0].message,/평가 기록/);
 plan=await api.rpc('previewRegistryBatch',payload('participants','edit',[rows[1]],{number:'3'}),api.actor);assert.equal(plan.ready,false);assert.match(plan.errors[0].message,/중복/);
 await apply(payload('participants','edit',rows.slice(1),r=>({number:r.prelimCupNo==='2'?'3':'2'})));
 rows=await players();const stale=payload('participants','edit',rows.slice(1),{affiliation:'동시 저장 금지'});plan=await api.rpc('previewRegistryBatch',stale,api.actor);
 race=()=>api.db.prepare("UPDATE participants SET affiliation='현장 변경',updated_at='race' WHERE id=?").run(rows[1].rowIndex);
 const raced=await reject('applyRegistryBatch',{...stale,revision:plan.revision},api.actor);assert.equal(raced.stale,true);assert.notEqual((await players())[2].affiliation,'동시 저장 금지');
 rows=await players();const deletion=payload('participants','delete',rows);plan=await api.rpc('previewRegistryBatch',deletion,api.actor);assert.equal(plan.ready,true);assert.equal(plan.blocked.length,1);assert.equal(plan.summary.length,2);
 const removed=await api.rpc('applyRegistryBatch',{...deletion,revision:plan.revision},api.actor);assert.equal((await players()).length,1);assert.ok(removed.backupKey);
  const trash=await api.rpc('getRegistryTrash',{target:'participants',competitionCode:'KBC'},api.actor);assert.equal(trash.items.length,1);assert.equal(trash.items[0].count,2);assert.equal(trash.items[0].backupKey,removed.backupKey);
 await api.rpc('restoreRegistryBatch',removed.backupKey,api.actor);assert.equal((await players()).length,3);assert.equal((await reject('restoreRegistryBatch',removed.backupKey,api.actor)).success,false);
 await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'겸임 심사',phone:'01084000001',access:'KBC,MOB',role:'센서리 심사위원',teamGroup:'A조'},api.actor);
 let ops=await operators(),shared=ops.find(r=>r.name==='겸임 심사');
 const opDelete=await apply(payload('operators','delete',[shared]));ops=await operators();assert.equal(ops.find(r=>r.rowIndex===shared.rowIndex).access,'MOB');await api.rpc('restoreRegistryBatch',opDelete.backupKey,api.actor);
 shared=(await operators()).find(r=>r.name==='겸임 심사');await apply(payload('operators','edit',[shared],{team:'B조',date:'2026-11-12',affiliation:'KBC 전용'}));ops=await operators();const mob=ops.find(r=>r.name==='겸임 심사'&&r.access==='MOB'),kbc=ops.find(r=>r.name==='겸임 심사'&&r.access==='KBC');assert.equal(mob.teamGroup,'A조');assert.equal(mob.affiliation,'');assert.equal(kbc.teamGroup,'B조');assert.equal(kbc.effectiveDate,'2026-11-12');
  await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'전대회 심사',phone:'01084000008',access:'ALL',role:'센서리 심사위원',teamGroup:'D조'},api.actor);
  const allScope=(await operators()).find(r=>r.name==='전대회 심사');const scopeDelete=await apply(payload('operators','delete',[allScope]));const remaining=(await operators()).find(r=>r.rowIndex===allScope.rowIndex);assert.ok(!remaining.access.split(',').includes('KBC'));assert.ok(remaining.access.split(',').includes('MOB'));await api.rpc('restoreRegistryBatch',scopeDelete.backupKey,api.actor);
 await api.rpc('upsertOperatorAccount',{accountType:'ADMIN',name:'검수 QA',phone:'01099990000',affiliation:'현재 관리자'},api.actor);
 await api.rpc('upsertOperatorAccount',{accountType:'ADMIN',name:'다른 관리자',phone:'01084000002',affiliation:'삭제 후 복원'},api.actor);
 const admins=(await operators()).filter(r=>r.accountType==='ADMIN');plan=await api.rpc('previewRegistryBatch',payload('admins','delete',admins),api.actor);assert.ok(plan.blocked.some(row=>/로그인/.test(row.reason)));assert.equal(plan.ready,true);
 const deletedAdmins=await api.rpc('applyRegistryBatch',{...payload('admins','delete',admins),revision:plan.revision},api.actor);assert.equal((await operators()).filter(r=>r.accountType==='ADMIN').length,1);await api.rpc('restoreRegistryBatch',deletedAdmins.backupKey,api.actor);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),originalScores);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM participants WHERE competition_code='MOB'").get().n,1);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='REGISTRY_BATCH_GUARD'").get().n,0);
  await api.rpc('upsertParticipant',{competitionCode:'KTCC',name:'기존 팀',teamName:'기존 팀',teamNo:'1',prelimCupNo:'1',extra:{'팀원1명':'옛 선수1','팀원2명':'옛 선수2'}},api.actor);
  const team=(await api.rpc('listParticipants','KTCC',api.actor)).participants[0];await apply(payload('participants','edit',[team],{name:'변경 팀',affiliation:'새 선수1, 새 선수2',number:'4'},'KTCC'));
  const changedTeam=(await api.rpc('listParticipants','KTCC',api.actor)).participants[0];assert.equal(changedTeam.teamName,'변경 팀');assert.equal(changedTeam.affiliation,'새 선수1, 새 선수2');assert.equal(changedTeam.teamNo,'4');
 console.log('Stage271 registry: field-level independent round edits, stale/duplicate guards, atomic race rollback, mixed protected deletes, undo, shared competition rights isolation and self-admin protection passed.');
}finally{api.close();}
