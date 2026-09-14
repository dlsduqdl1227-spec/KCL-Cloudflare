import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture();
try{
  const {stations,judges,lead}=await seedKcrStations(api);
  const other=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all());
  const finalists=stations.map(s=>({...s}));
  const preliminary=stations.map((s,i)=>({...s,prelimDay:i===2?2:1}));
  const save=async(list,actor=api.actor)=>api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:list,byRound:{예선:list,결선:finalists}}}},actor);
  await save(preliminary,lead);
  const options=()=>JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings).kcrStations;
  assert.deepEqual(options().byRound.예선.map(s=>[s.id,s.prelimDay]),[['stable-a',1],['stable-b',1],['stable-c',2]]);
  assert.ok(options().byRound.결선.every(s=>s.prelimDay===null),'legacy stations stay unassigned, not guessed from station number');
  // The same judge can score both days; day is not a new scoring round/team.
  for(const [i,judge] of judges.entries()){
    await api.rpc('submitScores',stationSubmission(judge,preliminary[0],7,true));
    await api.rpc('submitScores',stationSubmission(judge,preliminary[1],i?28:21));
    await api.rpc('submitScores',stationSubmission(judge,preliminary[2],i?35:28));
  }
  const scores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const rank=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.equal(rank.ranking.length,4);
  for(const row of rank.ranking){assert.equal(row.totalCount,2);assert.equal(row.score,Number(row.unit)<=2?24.5:31.5);}
  assert.equal((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking.length,0);
  const extended=[...preliminary,...Array.from({length:37},(_,i)=>({id:'extra-'+i,prefix:'X'+i,start:10+i,end:10+i,process:'Blending',prelimDay:i<16?1:2,useForCalibration:false,useForCompetition:true}))];
  await save(extended);assert.equal(options().byRound.예선.length,40);
  assert.deepEqual(options().byRound.예선.slice(0,3).map(s=>s.id),stations.map(s=>s.id));
  const over=await(await api.handle({action:'updateCompetitionAdminSettings',args:[{code:'KCR',optionSettings:{kcrStations:{stations:[...extended,{...extended[0],id:'too-many'}]}}},api.actor]})).json();
  assert.equal(over.success,false);
  // Reclassifying management metadata cannot rewrite a saved evaluation or ranking.
  extended[1].prelimDay=2;await save(extended);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),scores);
  const after=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.deepEqual(after.ranking.map(r=>[r.unit,r.score,r.totalCount]),rank.ranking.map(r=>[r.unit,r.score,r.totalCount]));
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all()),other);
  console.log('Stage222 KCR day metadata, 40 stations, stable IDs, two-day combined head/sensory ranking, calibration/final isolation and preservation passed.');
}finally{api.close();}
