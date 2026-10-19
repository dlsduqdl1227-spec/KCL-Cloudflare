import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {stationSubmission} from './helpers/kcr-station-fixture.mjs';
import {seedKcrDayClosure} from './helpers/kcr-day-closure-fixture.mjs';
const api=await createRpcFixture();
try {
  const {stations,judges,lead,save}=await seedKcrDayClosure(api);
  const readScores=()=>api.db.prepare('SELECT * FROM scores ORDER BY id').all();
  const before=JSON.stringify(readScores());
  const other=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code<>'KCR'").all());
  const ranks=(await api.rpc('getRanking','KCR',api.actor,'예선')).ranking;
  const previous=await api.rpc('getReviewList','KCR',judges[0]);
  await save([1]);
  assert.equal(JSON.stringify(readScores()),before);
  assert.deepEqual((await api.rpc('getRanking','KCR',api.actor,'예선')).ranking,ranks,'closing does not alter ranking inclusion');
  for(const judge of judges) {
    assert.equal((await api.rpc('getReviewList','KCR',judge)).list.length,0);
    const completion=(await api.rpc('getKcrStationEvaluationState',judge)).completion;
    assert.deepEqual(completion.officialUnits,[]);
    assert.deepEqual(completion.stations.map(s=>s.stationId),[stations[2].id]);
  }
  assert.equal((await api.rpc('getReviewList','KCR',{...judges[0],calibrationOnly:true})).list.length,0);
  for(const actor of [api.actor,lead]) {
    const list=(await api.rpc('getReviewList','KCR',{...actor,manageReview:true})).list;
    assert.equal(list.length,4); assert.ok(list.every(row=>row.stationClosed));
  }
  const deny=async(action,...args)=>{
    const r=await(await api.handle({action,args})).json();assert.equal(r.success,false,action);assert.match(r.message,/마감/,action);return r;
  };
  for(const actor of [api.actor,lead,...judges]) {
    await deny('updateReviewRow','KCR',previous.list[0].rowIndex,{[previous.headers.indexOf('종합코멘트')]:'금지된 수정'},'검수완료','',actor);
    await deny('submitScores',stationSubmission(actor,stations[1],35));
    await deny('submitScores',stationSubmission(actor,stations[0],35,true));
  }
  await deny('deleteReviewRow','KCR',previous.list[0].rowIndex,api.actor);
  await deny('deleteSelectedScoreData',{competitionCode:'KCR',round:'예선',unit:'1',category:'competition'},api.actor);
  await deny('clearScores','KCR',api.actor);
  await deny('updateReviewStatusBatch','KCR',previous.list.map(r=>r.rowIndex),'미검수','',api.actor);
  await deny('updateReviewStatus','KCR',previous.list[0].rowIndex,'미검수','',api.actor);
  const oldConfig=(await api.rpc('getConfig')).configs.find(c=>c.code==='KCR');
  const oldSettings=structuredClone(oldConfig.optionSettings);delete oldSettings.kcrStations.closedPrelimDays;
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:oldSettings},lead);
  assert.deepEqual(JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings).kcrStations.closedPrelimDays,[1],'old client save cannot reopen');
  const changed=stations.map(s=>({...s}));changed[1].prelimDay=2;
  await deny('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',optionSettings:{kcrStations:{byRound:{예선:changed},closedPrelimDays:[1]}}},api.actor);
  assert.equal(JSON.stringify(readScores()),before,'all denied operations leave every byte intact');
  // Day two uses the same judges and the same preliminary ranking, not a new round.
  for(const judge of judges)await api.rpc('submitScores',stationSubmission(judge,stations[2],35));
  for(const judge of judges) {
    const result=await api.rpc('getReviewList','KCR',judge);
    assert.deepEqual(result.list.map(r=>r.unit).sort(),['114','115']);
    assert.ok(result.list.every(r=>!r.stationClosed));
    await api.rpc('updateReviewRow','KCR',result.list[0].rowIndex,{[result.headers.indexOf('종합코멘트')]:'2일차 수정 유지'},'수정완료','',judge);
  }
  assert.equal(JSON.stringify(readScores().filter(row=>row.id<=JSON.parse(before).at(-1).id)),before);
  assert.deepEqual((await api.rpc('getRanking','KCR',api.actor,'예선')).ranking.map(r=>r.unit).sort(),['1','114','115','2']);
  assert.equal((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking.length,0);
  const dayTwo=(await api.rpc('getReviewList','KCR',judges[0])).list[0];
  await deny('updateReviewStatusBatch','KCR',[dayTwo.rowIndex,previous.list[0].rowIndex],'미검수','',api.actor);
  assert.equal((await api.rpc('getReviewList','KCR',judges[0])).list.find(r=>r.rowIndex===dayTwo.rowIndex).status,dayTwo.status,'mixed batch fails before any write');
  await save([]);assert.equal((await api.rpc('getReviewList','KCR',judges[0])).list.length,4,'explicit management reopening is possible');
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code<>'KCR'").all()),other);
  console.log('Stage240 day closure: server-enforced hiding/locking, admin read-only access, stale clients, deletion protection, day-two submit/edit, combined ranks and preservation passed.');
} finally {api.close();}
