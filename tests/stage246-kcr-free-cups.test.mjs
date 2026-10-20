import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedFreeCups,freeCupSubmission} from './helpers/kcr-free-cups-fixture.mjs';
import {stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture();
const request=async(action,...args)=>(await api.handle({action,args})).json();
try{
 const {judges,lead,stations,config,finalStation,second}=await seedFreeCups(api);
 await api.rpc('submitScores',stationSubmission(judges[0],stations[2],21));
 const original=api.db.prepare("SELECT * FROM scores ORDER BY id").all();
 const prelim=JSON.stringify(config.optionSettings.kcrStations.byRound.예선);
 const other=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all());
 const saved=await api.rpc('saveKcrStationSettings',{round:'결선',stations:[finalStation,second],previousStations:config.optionSettings.kcrStations.byRound.결선},lead);
 assert.equal(saved.currentRound,'예선','preparing finals cannot switch the live contest');
 assert.equal(JSON.stringify(saved.optionSettings.kcrStations.byRound.예선),prelim);
 assert.deepEqual(saved.optionSettings.kcrStations.stations,config.optionSettings.kcrStations.stations);
 assert.deepEqual(api.db.prepare('SELECT * FROM scores ORDER BY id').all(),original);
 let current=saved.optionSettings.kcrStations.byRound.결선;
 assert.deepEqual(current[0].cupNumbers,finalStation.cupNumbers);
 assert.deepEqual(current[1].cupNumbers,second.cupNumbers,'input order is preserved, not sorted');
 assert.equal((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking.length,0);
 // Old in-progress preliminary submission remains valid after final setup.
 await api.rpc('submitScores',stationSubmission(judges[1],stations[1],28));
 const before=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE round='예선' ORDER BY id").all());
 const prelimRanking=await api.rpc('getRanking','KCR',api.actor,'예선');
 const links=await api.rpc('getStationCupParticipants','KCR','결선',api.actor);
 assert.deepEqual(links.stations[0].cups.map(c=>c.unit),finalStation.cupNumbers);
 assert.ok(links.stations[0].cups.every(c=>c.status==='linked'));
 for(const actor of [judges[0],{}]){
  assert.equal((await request('saveKcrStationSettings',{round:'결선',stations:current,previousStations:current},actor)).success,false);
 }
 const invalid=[[],['3','003'],['-1'],['1.5'],['1000'],['A-1'],Array.from({length:21},(_,i)=>String(i+1)),'3,18'];
 for(const cupNumbers of invalid){
  const result=await request('saveKcrStationSettings',{round:'결선',stations:[{...current[0],cupNumbers}],previousStations:current},api.actor);
  assert.equal(result.success,false,JSON.stringify(cupNumbers));
 }
 const duplicate=await request('saveKcrStationSettings',{round:'결선',stations:[current[0],{...current[1],cupNumbers:['3']}],previousStations:current},api.actor);
 assert.equal(duplicate.success,false);assert.match(duplicate.message,/중복/);
 // Stale managers cannot overwrite a newer selection.
 assert.equal((await request('saveKcrStationSettings',{round:'결선',stations:[{...current[0],cupNumbers:['3']}],previousStations:config.optionSettings.kcrStations.byRound.결선},api.actor)).success,false);
 assert.equal((await request('saveKcrStationSettings',{round:'결선',stations:current,previousStations:config.optionSettings.kcrStations.byRound.결선},api.actor)).success,true,'retry after lost response is idempotent');
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선',isActive:true,debriefing:true},api.actor);
 assert.deepEqual((await api.rpc('getKcrStationEvaluationState',judges[0])).completion.officialUnits,[]);
 const payload=freeCupSubmission(judges[0],current[0]);
 const missing={...payload,rows:payload.rows.slice(0,4)};
 assert.equal((await request('submitScores',missing)).success,false,'cannot partially insert');
 const wrong={...payload,rows:payload.rows.map((row,i)=>i?row:{...row,data:['4','Blending']})};
 assert.equal((await request('submitScores',wrong)).success,false,'range holes are not cups');
 assert.equal((await api.rpc('submitScores',payload)).inserted,5);
 assert.equal((await request('submitScores',payload)).duplicate,true);
 await api.rpc('submitScores',freeCupSubmission(judges[0],current[1]));
 const ranked=await api.rpc('getRanking','KCR',api.actor,'결선');
 assert.equal(ranked.ranking.length,13);
 assert.ok(ranked.ranking.every(r=>r.round==='결선'));
 const detail=await api.rpc('getRankingDetail','KCR','3','결선',api.actor);
 assert.equal(detail.rows.length,1);assert.match(detail.rows[0]['종합코멘트'],/결선 독립 코멘트 3/);
 const publicData=async phase=>{
  api.db.prepare("INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES('KCR',?,?,?,'2099-01-01T00:00:00Z')").run('독립 선수 3','01077770003','246246');
  return api.rpc('verifyOTP','독립 선수 3','01077770003','KCR','246246',phase);
 };
 const finalPublic=await publicData('결선');
 const preview=await api.rpc('getAdminDebriefPreview','KCR','3','결선',api.actor);
 assert.deepEqual(finalPublic.scores,preview.scores);
 assert.equal(finalPublic.scores.length,1);assert.ok(finalPublic.scores.every(s=>(s.round||s['라운드'])==='결선'));
 const prelimPublic=await publicData('예선');
 assert.equal(prelimPublic.scores.length,1,'same cup has its own preliminary record');
 assert.ok(prelimPublic.scores.every(s=>(s.round||s['라운드'])==='예선'));
 assert.doesNotMatch(JSON.stringify(prelimPublic.scores),/결선 독립 코멘트/);
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE round='예선' ORDER BY id").all()),before);
 assert.deepEqual((await api.rpc('getRanking','KCR',api.actor,'예선')).ranking,prelimRanking.ranking);
 // Updating the middle cup changes station identity checks even with same min/max.
 current=(await api.rpc('getConfig')).configs.find(c=>c.code==='KCR').optionSettings.kcrStations.byRound.결선;
 const edited=await api.rpc('saveKcrStationSettings',{round:'결선',stations:[{...current[0],cupNumbers:['3','19','42','77','114']},current[1]],previousStations:current},api.actor);
 assert.equal(edited.success,true);
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE round='예선' ORDER BY id").all()),before);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE round='결선'").get().n,13,'station edit cannot delete historical cups');
 // Final cups can reuse a closed preliminary station's ID and cup numbers.
 const options=edited.optionSettings;
 const closedPrelim=options.kcrStations.byRound.예선.map(s=>({...s,prelimDay:1}));
 const reused={...finalStation,id:stations[2].id,prefix:stations[2].prefix};
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선',isActive:true,
  optionSettings:{...options,kcrStations:{...options.kcrStations,closedPrelimDays:[1],byRound:{예선:closedPrelim,결선:[reused,second]},stations:[reused,second]}}},api.actor);
 assert.equal((await api.rpc('submitScores',freeCupSubmission(judges[1],reused))).inserted,5);
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE round='예선' ORDER BY id").all()),before,'final using a closed preliminary ID leaves all preliminary scores intact');
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all()),other);
 console.log('Stage246 sparse 5/8 cups, authorization, duplicate/stale/missing guards, live preliminary preservation, exact final ranking/debrief and public/preview parity passed.');
}finally{api.close();}
