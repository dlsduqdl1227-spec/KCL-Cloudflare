import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';
const api=await createRpcFixture();
try{
  const {judges,head2,outsider,freshHead,lead}=await seedKcrComparison(api);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const registry=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
  const official=await api.rpc('getReviewList','KCR',judges[0]);
  assert.equal(official.list.length,2,'head keeps only own editable submissions');
  for(const row of official.list){
    const stats=row._stddev;
    assert.equal(stats.purpose,'official-review');assert.equal(stats.judgeCount,3);assert.equal(stats.headCount,2);
    assert.equal(stats.totalAvg,28);assert.equal(stats.totalStddev,5.7155);assert.equal(stats.headTotalAvg,24.5);assert.equal(stats.headTotalStddev,3.5);
    for(const metric of stats.metrics){assert.equal(metric.avg,4,metric.key);assert.equal(metric.stddev,.8165);assert.equal(metric.headAvg,3.5);assert.equal(metric.headStddev,.5);}
    const own=stats.judges.find(j=>j.judgeName===judges[0].name);
    assert.equal(own.deviations.total,-7);assert.equal(own.headDeviations.total,-3.5);assert.equal(own.deviations.aftertaste,-1);
    assert.equal(own.attributeComments[0].text,judges[0].name+' 플레이버 기록');
    assert.ok(stats.judges.every(j=>!j.comment.includes('켈리')));
  }
  const cal=await api.rpc('getReviewList','KCR',{...judges[0],calibrationOnly:true,stationId:'other-cal',manageReview:true,reviewScope:'manage'});
  assert.equal(cal.list.length,6,'forged station and manage flags do not grant another station');
  assert.ok(cal.list.every(row=>row._stddev.stationId==='stable-a'&&row._stddev.purpose==='calibration-review'));
  assert.ok(cal.list.every(row=>row._stddev.judges.every(j=>!j.comment.includes('대회'))));
  assert.equal((await api.rpc('getReviewList','KCR',{...head2,calibrationOnly:true})).list.length,6);
  assert.equal((await api.rpc('getReviewList','KCR',{...outsider,calibrationOnly:true})).list.length,2);
  assert.equal((await api.rpc('getReviewList','KCR',{...freshHead,calibrationOnly:true})).list.length,0);
  for(const manager of [api.actor,lead])assert.equal((await api.rpc('getReviewList','KCR',{...manager,calibrationOnly:true})).list.length,8);
  const sensory=await api.rpc('getReviewList','KCR',judges[1]);assert.ok(sensory.list.every(row=>!row._stddev));
  const denied=await(await api.handle({action:'getReviewList',args:['KCR',{...judges[1],calibrationOnly:true,role:'관리자',manageReview:true}]})).json();assert.equal(denied.success,false);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'viewing comparisons never writes scores');
  const row=official.list[0],updates={[official.headers.indexOf('종합코멘트')]:'본인 검수 코멘트'};
  await api.rpc('updateReviewRow','KCR',row.rowIndex,updates,'검수완료',judges[0].role,judges[0]);
  const after=await api.rpc('getReviewList','KCR',judges[0]);
  assert.equal(after.list.length,2);assert.ok(after.list.some(r=>r['종합코멘트']==='본인 검수 코멘트'));
  assert.equal(after.list[0]._stddev.totalAvg,28);
  const forbidden=await(await api.handle({action:'updateReviewRow',args:['KCR',sensory.list[0].rowIndex,updates,'검수완료','관리자',{...judges[0],manageReview:true,reviewScope:'manage'}]})).json();assert.equal(forbidden.success,false);
  const scoreUpdates={[official.headers.indexOf('Flavor(플레이버)')]:3.4};
  await api.rpc('updateReviewRow','KCR',row.rowIndex,scoreUpdates,'검수완료',judges[0].role,judges[0]);
  const changed=await api.rpc('getReviewList','KCR',head2);
  const peer=changed.list.find(r=>r.unit===row.unit)._stddev.judges.find(j=>j.judgeName===judges[0].name);
  assert.equal(peer.flavor,3.4);assert.equal(peer.comment,'본인 검수 코멘트');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),registry);
  console.log('Stage211 head station access, head/all population SD, individual deltas, actual headers, comments, own editing and other-judge write rejection passed.');
}finally{api.close();}
