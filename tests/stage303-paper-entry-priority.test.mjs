import assert from 'node:assert/strict';
import {createPaperEntryFixture} from './helpers/paper-entry-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

// All mutations in this file use disposable in-memory databases only.
let mutation=null;
const api=await createPaperEntryFixture({beforeBatch:statements=>{
 if(mutation&&statements.some(s=>s.sql.includes("THEN 'PAPER_ENTRY_GUARD'"))){const apply=mutation;mutation=null;apply();}
}});
try{
 const code='KBC',target=api.targets[code][0];
 const entry=(await api.create(code,'예선',[target.id])).entries[0];
 await api.rpc('submitScores',api.payload(code,entry.token,'예선'));
 let before=api.db.prepare("SELECT * FROM scores WHERE competition_code=? AND round='예선' AND judge_name=?").get(code,target.name);
 // An old duplicate is archived and removed only for the selected judge/unit/round.
 const legacy=JSON.parse(before.payload_json);delete legacy.clientSubmissionId;delete legacy.finalEvaluationKey;
 api.db.prepare(`INSERT INTO scores(submitted_at,competition_code,round,judge_name,team,role,mode,unit,participant_name,total_score,disqualified,disqualification_reason,review_status,payload_json,signature_data)
 SELECT submitted_at,competition_code,round,judge_name,team,role,mode,unit,participant_name,total_score,disqualified,disqualification_reason,review_status,?,signature_data FROM scores WHERE id=?`).run(JSON.stringify(legacy),before.id);
 const p=api.payload(code,entry.token,'예선');p.rows[0].extraFields.종합코멘트='중복 없이 최종 입력';
 await api.rpc('submitScores',p);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE competition_code=? AND round='예선' AND judge_name=?").get(code,target.name).n,1);
 before=api.db.prepare("SELECT * FROM scores WHERE competition_code=? AND round='예선' AND judge_name=?").get(code,target.name);
 const originals=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const archives=api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='PAPER_ENTRY_ARCHIVE'").get().n;
 const failing=api.payload(code,entry.token,'예선');failing.rows[0].extraFields.종합코멘트='실패해서 저장되면 안 되는 입력';
 mutation=()=>api.db.prepare('UPDATE operators SET role=? WHERE id=?').run('테크니컬 심사위원',target.id);
 const roleRace=await api.raw('submitScores',failing);assert.equal(roleRace.success,false);assert.equal(roleRace.stale,true);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),originals,'failed atomic replacement preserves every original score');
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='PAPER_ENTRY_ARCHIVE'").get().n,archives,'no archive/partial deletion on failure');
 api.db.prepare('UPDATE operators SET role=? WHERE id=?').run(target.role,target.id);
 mutation=()=>api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(before.payload_json.replace('중복 없이 최종 입력','동시에 저장된 올바른 평가'),before.id);
 const scoreRace=await api.raw('submitScores',failing);assert.equal(scoreRace.success,false);assert.equal(scoreRace.stale,true);
 assert.match(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(before.id).payload_json,/동시에 저장된 올바른 평가/);
 const ticket=(await api.create('KBC','결선',[target.id])).entries[0],final=api.payload(code,ticket.token);
 final.participantId=api.db.prepare("SELECT id FROM participants WHERE competition_code='KBC'").get().id;
 await api.rpc('submitScores',final);
 const oldFinal=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='KBC' AND round='결선' ORDER BY id").all());
 const replacement=api.payload(code,ticket.token);replacement.participantId=final.participantId;
 mutation=()=>api.db.prepare("UPDATE participants SET final_cup_no='2' WHERE id=?").run(final.participantId);
 assert.equal((await api.raw('submitScores',replacement)).stale,true,'participant remapping is guarded inside replacement transaction');
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='KBC' AND round='결선' ORDER BY id").all()),oldFinal);
 api.db.prepare("UPDATE participants SET final_cup_no='1' WHERE id=?").run(final.participantId);
 const closedOptions=JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings);
 closedOptions.kcrStations.closedPrelimDays=[1];for(const st of closedOptions.kcrStations.byRound.예선)st.prelimDay=1;
 api.db.prepare("UPDATE competitions SET is_active=0,option_settings=? WHERE code='KCR'").run(JSON.stringify(closedOptions));
 const kcrTicket=(await api.create('KCR','예선',[api.targets.KCR[0].id])).entries[0];
 assert.deepEqual((await api.rpc('getConfig',{judgeToken:kcrTicket.token})).configs[0].optionSettings.kcrStations.closedPrelimDays,[]);
 await api.rpc('submitScores',api.payload('KCR',kcrTicket.token,'예선'));
 assert.equal(api.db.prepare("SELECT is_active FROM competitions WHERE code='KCR'").get().is_active,0);
 assert.equal(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings,JSON.stringify(closedOptions),'closed live day stays closed');
 // MOB heads remain comparison-only even if a caller supplies a scoring mode.
 const mobBefore=JSON.stringify((await api.rpc('getRanking','MOB',api.actor,'결선')).ranking);
 await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'수기 MOB 헤드',phone:'01098980001',access:'MOB',role:'센서리 헤드 심사위원'},api.actor);
 const mobId=api.db.prepare("SELECT id FROM operators WHERE name='수기 MOB 헤드'").get().id;
 const mobEntry=(await api.create('MOB','결선',[mobId])).entries[0];
 const mobPayload=api.payload('MOB',mobEntry.token);mobPayload.rows[0].extraFields['센서리 총점']=40;await api.rpc('submitScores',mobPayload);
 assert.match(api.db.prepare("SELECT mode FROM scores WHERE judge_name='수기 MOB 헤드'").get().mode,/켈리브레이션/);
 assert.equal(JSON.stringify((await api.rpc('getRanking','MOB',api.actor,'결선')).ranking),mobBefore,'MOB head input never adds to official scores');
 for(const competition of ['KCR','KBC']){
  const prior=(await api.rpc('getRanking',competition,api.actor,'결선')).ranking[0].score;
  const count=api.db.prepare("SELECT COUNT(*) n FROM scores WHERE competition_code=? AND round='결선'").get(competition).n;
  await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'수기 헤드 '+competition,phone:competition==='KCR'?'01098980002':'01098980003',access:competition,role:'센서리 헤드 심사위원'},api.actor);
  const id=api.db.prepare('SELECT id FROM operators WHERE name=?').get('수기 헤드 '+competition).id;
  const head=(await api.create(competition,'결선',[id])).entries[0],headPayload=api.payload(competition,head.token);headPayload.rows[0].extraFields.총점=20;headPayload.totalScore=20;headPayload.computedTotalScore=20;
  await api.rpc('submitScores',headPayload);
  assert.equal((await api.rpc('getRanking',competition,api.actor,'결선')).ranking[0].score,competition==='KCR'?prior+20:Math.round((prior*count+20)/(count+1)*1000)/1000,competition+' heads retain the existing sum/average rule');
 }
 console.log('Stage303 priority: duplicate cleanup, atomic authority/score/roster races, private archives, closed-day scoped amendment and MOB head exclusion passed.');
}finally{api.close();}

const ikrc=await createRpcFixture();
try{
 const {judges,stations}=await seedIkrcFinal(ikrc);
 const ids=judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
 ikrc.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
 for(const judge of judges)for(const st of stations)await ikrc.rpc('submitScores',ikrcFinalSubmission(judge,st,6));
 const beforeB=JSON.stringify(ikrc.db.prepare("SELECT * FROM scores WHERE unit LIKE 'B-%' ORDER BY id").all());
 const tickets=await ikrc.rpc('createPaperEntrySessions',{competitionCode:'IKRC',round:'결선',operatorIds:ids,paperConfirmed:true},ikrc.actor);
 for(const [i,entry]of tickets.entries.entries()){
  await ikrc.rpc('checkIkrcFinalJudgeAccess',{judgeToken:entry.token});
  const result=await ikrc.rpc('submitScores',ikrcFinalSubmission({...judges[i],judgeToken:entry.token},stations[0],i?7:9));assert.equal(result.inserted,6);
  const a=(await ikrc.rpc('getRanking','IKRC',ikrc.actor,'결선')).ranking.find(r=>r.unit==='A-1');
  assert.equal(a.rankingScore,60+i*2,'only five sensory scores determine the mean; the head remains comparison-only');
  assert.equal(a.headCount,1);assert.equal(a.sensoryCount,5);
 }
 assert.equal(JSON.stringify(ikrc.db.prepare("SELECT * FROM scores WHERE unit LIKE 'B-%' ORDER BY id").all()),beforeB);
 assert.equal(ikrc.db.prepare('SELECT COUNT(*) n FROM scores').get().n,72,'replacement adds no extra judging votes');
 const preview=await ikrc.rpc('getAdminDebriefPreview','IKRC','A-1','결선',ikrc.actor);assert.equal(preview.rankInfo.rankingScore,70);
 console.log('Stage303 IKRC: assigned head + five sensory, both stations, head excluded from final mean and six existing judge records replaced in place passed.');
}finally{ikrc.close();}

const kcac=await createRpcFixture();
try{
 const roles=['패턴디자인 헤드 심사위원','패턴디자인 헤드 심사위원','일반우유 센서리 헤드 심사위원','오트 센서리 헤드 심사위원'],types=['final-pattern','final-pattern','sensory-regular','sensory-oat'];
 await kcac.rpc('upsertParticipant',{competitionCode:'KCAC',name:'KCAC 수기 선수',uniqueNo:'1',finalCupNo:'1'},kcac.actor);
 await kcac.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,optionSettings:{kcacFinalPanelMode:'split-four-heads-160'}},kcac.actor);
 const ids=[];
 for(let i=0;i<4;i++){
  await kcac.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'KCAC 수기 헤드 '+i,phone:'0109898100'+i,access:'KCAC',role:roles[i]},kcac.actor);
  ids.push(kcac.db.prepare('SELECT id FROM operators WHERE name=?').get('KCAC 수기 헤드 '+i).id);
 }
 const entries=(await kcac.rpc('createPaperEntrySessions',{competitionCode:'KCAC',round:'결선',operatorIds:ids,paperConfirmed:true},kcac.actor)).entries;
 function payload(index,value){
  const pattern=index<2,keys=pattern?['Theme Expression(주제 표현력)','Technical Execution(작업 수행 완성도)','Cleanliness(청결)','Surface Quality(표면 품질)','Position & Symmetry(위치와 대칭)','Design Completion(디자인 완성도)']:['Taste Balance(맛의 균형)','Mouthfeel(질감)','Presentation(프레젠테이션)'];
  return {competitionCode:'KCAC',round:'결선',judgeToken:entries[index].token,clientSubmissionId:crypto.randomUUID(),mode:'judge',rows:[{data:['1'],extraFields:{...Object.fromEntries(keys.map(k=>['결선 '+k,value])),잔용도:pattern?'창작패턴평가':'센서리용아트',패턴종류:types[index],종합코멘트:'심사위원 원본 수기 기록'}}]};
 }
 for(let i=0;i<4;i++)await kcac.rpc('submitScores',payload(i,5));
 assert.equal((await kcac.rpc('getRanking','KCAC',kcac.actor,'결선')).ranking[0].score,160,'60+60+20+20');
 for(let i=0;i<4;i++)await kcac.rpc('submitScores',payload(i,4));
 assert.equal(kcac.db.prepare('SELECT COUNT(*) n FROM scores').get().n,4,'full panels can be replaced without a fifth vote');
 assert.equal((await kcac.rpc('getRanking','KCAC',kcac.actor,'결선')).ranking[0].score,128,'48+48+16+16');
 const wrong=payload(2,4);wrong.rows[0].extraFields.패턴종류='sensory-oat';
 assert.equal((await(await kcac.handle({action:'submitScores',args:[wrong]})).json()).success,false,'transcription preserves assigned milk/sensory area');
 console.log('Stage303 KCAC: all four head roles, 160-point combined scoring, occupied-panel replacement, correct role/area enforcement passed.');
}finally{kcac.close();}
