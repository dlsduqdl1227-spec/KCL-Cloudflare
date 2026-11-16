import assert from 'node:assert/strict';
import {createPaperEntryFixture} from './helpers/paper-entry-fixture.mjs';
const api=await createPaperEntryFixture();
try{
 const originals=api.db.prepare('SELECT * FROM scores ORDER BY id').all(),originalsJson=JSON.stringify(originals),settings=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
 for(const code of api.codes){
  const roster=await api.rpc('getPaperEntryRoster',{competitionCode:code},api.leads[code]);assert.ok(roster.rounds.includes('예선'));assert.ok(roster.judges.some(j=>j.id===api.targets[code][0].id));assert.ok(!roster.judges.some(j=>j.name.startsWith('수기 팀장')));
  assert.equal((await api.raw('getPaperEntryRoster',{competitionCode:code},{})).success,false);
  const ordinary=await api.rpc('judgeLogin',api.targets[code][0].name,api.targets[code][0].phone);
  assert.equal((await api.raw('createPaperEntrySessions',{competitionCode:code,round:'결선',operatorIds:[api.targets[code][0].id],paperConfirmed:true},ordinary)).success,false);
  const sessions=await api.create(code);assert.equal(sessions.entries.length,2);assert.notEqual(sessions.entries[0].token,sessions.entries[1].token);
  for(const [index,entry]of sessions.entries.entries()){
   const boot=await api.rpc('getPaperEntryBootstrap',entry.token);assert.equal(boot.actor.name,api.targets[code][index].name);assert.equal(boot.actor.access,code);assert.equal(boot.actor._paperEntry,undefined);assert.equal(boot.config.currentRound,'결선');
   assert.ok(!JSON.stringify(boot).includes(api.leads[code].judgeToken));
   assert.equal((await api.raw('updateCompetitionAdminSettings',{code,currentRound:'예선'},boot.actor)).success,false);
   assert.equal((await api.raw('getRanking',code,boot.actor,'결선')).success,false);
   const p=api.payload(code,entry.token);p.signatureBase64='FORGED_SIGNATURE';
   const wrong={...p,round:'예선'};assert.equal((await api.raw('submitScores',wrong)).success,false);
   const saved=await api.rpc('submitWithSignature',p,'FORGED_SIGNATURE');assert.ok(saved.inserted>0);
   const row=api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND judge_name=? ORDER BY id DESC').get(code,entry.name),payload=JSON.parse(row.payload_json);
   assert.equal(row.judge_name,entry.name);assert.equal(row.review_status,'검수완료');assert.equal(row.role,api.targets[code][index].role);assert.equal(row.signature_data,'');assert.equal(payload.signatureBase64,undefined);assert.equal(payload.paperEntryAudit.enteredBy,api.leads[code].name);assert.ok(payload.paperEntryAudit.enteredAt);
   assert.equal(payload.judgeToken,undefined);const replay=await api.rpc('submitScores',p);assert.equal(replay.idempotent,true,'retry is not a duplicate vote');
   assert.ok(!JSON.stringify(payload).includes(entry.token),'no scoped bearer stored with scores');
  }
  const unit=code==='IKRC'?'A-1':'1',preview=await api.rpc('getAdminDebriefPreview',code,unit,'결선',api.actor);
  assert.ok(preview.scores.some(s=>s['심사위원명']===sessions.entries[['MOC','KTCC'].includes(code)?1:0].name),code);
  const publicText=JSON.stringify(preview);assert.ok(!publicText.includes(api.leads[code].name));assert.ok(!/paperEntryAudit|enteredBy|enteredAt|submittedAt|submitted_at|제출시간|timestamp/.test(publicText));
  const sourceDate=api.db.prepare('SELECT submitted_at FROM scores WHERE competition_code=? AND judge_name=? ORDER BY id DESC').get(code,sessions.entries[0].name).submitted_at;assert.ok(!publicText.includes(sourceDate));
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<=? ORDER BY id').all(originals.at(-1).id)),originalsJson,'existing signed records are byte-identical');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),settings,'entry sessions never open or switch a live competition');
 for(const code of api.codes){
  const target=api.targets[code][0],before=api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND judge_name=?').get(code,target.name),others=JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(before.id));
  const entry=(await api.rpc('createPaperEntrySessions',{competitionCode:code,round:'결선',operatorIds:[target.id],paperConfirmed:true,replaceExisting:true,day:'1'},api.leads[code])).entries[0];
  const p=api.payload(code,entry.token);p.rows[0].extraFields.종합코멘트='새 종이 평가 최종 기록 '+code;
  await api.rpc('submitScores',p);
  const after=api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND judge_name=?').get(code,target.name);
  assert.equal(after.id,before.id);assert.equal(after.submitted_at,before.submitted_at);assert.equal(JSON.parse(after.payload_json).rows[0].extraFields.종합코멘트,'새 종이 평가 최종 기록 '+code);
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores WHERE competition_code=? AND judge_name=?').get(code,target.name).n,1);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(before.id)),others,'replacement never touches another judge/round/competition');
  assert.ok(api.db.prepare("SELECT payload_json FROM sessions WHERE kind='PAPER_ENTRY_ARCHIVE'").all().some(r=>JSON.parse(r.payload_json).previousRows.some(row=>row.id===before.id&&row.payload_json===before.payload_json)),'old content archived privately');
 }
 assert.equal((await api.raw('getPaperEntryRoster',{competitionCode:'KBC'},api.leads.MOB)).success,false);
 const target=api.targets.KBC[0],ticket=(await api.create('KBC')).entries[0],normal=await api.rpc('judgeLogin',target.name,target.phone);
 for(const code of api.codes){
  const judge=api.targets[code][0],entry=(await api.create(code,'예선',[judge.id])).entries[0],p=api.payload(code,entry.token,'예선');
  p.rows[0].extraFields.종합코멘트='예선 수기 최우선 '+code;
  const beforeOther=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE NOT (competition_code=? AND round='예선' AND judge_name=?) ORDER BY id").all(code,judge.name));
  await api.rpc('submitScores',p);
  const before=api.db.prepare("SELECT * FROM scores WHERE competition_code=? AND round='예선' AND judge_name=?").get(code,judge.name);assert.equal(before.review_status,'검수완료','preliminary manager entry counts immediately');
  p.clientSubmissionId+='-replace';p.rows[0].extraFields.종합코멘트='예선 교체 최종 '+code;await api.rpc('submitScores',p);
  const after=api.db.prepare('SELECT * FROM scores WHERE id=?').get(before.id);assert.match(after.payload_json,/예선 교체 최종/);assert.equal(after.submitted_at,before.submitted_at);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE competition_code=? AND round='예선' AND judge_name=?").get(code,judge.name).n,1);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE NOT (competition_code=? AND round='예선' AND judge_name=?) ORDER BY id").all(code,judge.name)),beforeOther);
  const normal=await api.rpc('judgeLogin',judge.name,judge.phone),ordinary=api.payload(code,normal.judgeToken,'예선');
  assert.equal((await api.raw('submitScores',ordinary)).success,false,'ordinary submissions cannot supersede manager final entry');
  assert.equal((await api.raw('updateReviewRow',code,after.id,{},'수정완료',judge.role,normal)).success,false,'ordinary editors cannot supersede manager final entry');
  assert.equal((await api.raw('updateReviewStatusBatch',code,[after.id],'검수완료',judge.role,normal)).success,false,'ordinary status writes cannot change manager entry');
 }
 assert.equal((await api.raw('createPaperEntrySessions',{competitionCode:'KBC',round:'임의',operatorIds:[target.id],paperConfirmed:true},api.leads.KBC)).success,false);
 assert.equal((await api.raw('createPaperEntrySessions',{competitionCode:'KBC',round:'결선',operatorIds:[target.id,target.id],paperConfirmed:true},api.leads.KBC)).success,false);
 assert.equal((await api.raw('createPaperEntrySessions',{competitionCode:'MOB',round:'결선',operatorIds:[target.id],paperConfirmed:true},api.leads.MOB)).success,false);
 api.db.prepare('UPDATE operators SET role=? WHERE id=?').run('테크니컬 심사위원',target.id);
 assert.equal((await api.raw('getPaperEntryBootstrap',ticket.token)).success,false,'changed target invalidates the delegated session');
 api.db.prepare('UPDATE operators SET role=? WHERE id=?').run(target.role,target.id);
 const finalTicket=(await api.create('MOC','본선')).entries[0],boot=await api.rpc('getPaperEntryBootstrap',finalTicket.token);assert.equal(boot.config.currentRound,'본선');
 assert.equal((await api.rpc('getConfig',{judgeToken:finalTicket.token})).configs[0].currentRound,'본선');
 const assignments=await api.rpc('getParticipantAssignments','MOC',{judgeToken:finalTicket.token});assert.equal(assignments.currentRound,'본선');
 api.db.prepare('DELETE FROM sessions WHERE token=?').run(api.leads.MOC.judgeToken);assert.equal((await api.raw('getPaperEntryBootstrap',finalTicket.token)).success,false,'original manager session must remain valid');
 assert.equal((await api.rpc('getTeamLeadPreviewPolicy',api.actor)).enabled,true);
 assert.equal((await api.rpc('getDebriefPreviewAccess',api.leads.KBC)).codes.join(','),'KBC');
 assert.equal((await api.raw('getAdminDebriefPreviewOptions','MOB',api.leads.KBC)).success,false);
 assert.equal((await api.raw('setTeamLeadPreviewPolicy',{enabled:false},api.leads.KBC)).success,false);
 await api.rpc('setTeamLeadPreviewPolicy',{enabled:false},api.actor);
 assert.equal((await api.raw('getAdminDebriefPreviewOptions','KBC',api.leads.KBC)).success,false);assert.equal((await api.raw('getDebriefPreviewAccess',api.leads.KBC)).success,false);
 assert.equal((await api.raw('getAdminDebriefPreviewOptions','KBC',api.actor)).success,true);
 await api.rpc('setTeamLeadPreviewPolicy',{enabled:true},api.actor);assert.equal((await api.raw('getAdminDebriefPreviewOptions','KBC',api.leads.KBC)).success,true);
 assert.equal((await api.raw('setTeamLeadPreviewPolicy',{enabled:false},{name:api.actor.name,phone:api.actor.phone})).success,false,'no name/phone fallback for privileged switches');
 console.log('Stage303 paper entry: scoped multi-judge attribution for seven competitions, isolated finals, preserved originals, duplicate guards, no forged signature, revoked authority, public date/audit removal and administrator-only lead preview switch passed.');
}finally{api.close();}
