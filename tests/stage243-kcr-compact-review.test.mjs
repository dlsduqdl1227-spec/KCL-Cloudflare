import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';

const api=await createRpcFixture();
try {
  const {judges,head2,outsider,freshHead,lead}=await seedKcrComparison(api);
  const snapshot=()=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const before=snapshot();
  const actors=[api.actor,{...api.actor,reviewScope:'manage'},lead,{...lead,manageReview:true},...judges,head2,outsider,freshHead];
  let comparisons=0;
  for(const base of actors)for(const calibrationOnly of [false,true]) {
    const actor={...base,calibrationOnly};
    const full=await(await api.handle({action:'getReviewList',args:['KCR',actor]})).json();
    const compact=await(await api.handle({action:'getReviewList',args:['KCR',{...actor,compactReview:true}]})).json();
    if(!full.success){assert.deepEqual(compact,full);continue;}
    assert.equal(compact.success,true);
    assert.deepEqual(compact.headers,full.headers,'header indices stay stable for numeric edits');
    assert.deepEqual(compact.list.map(x=>x.rowIndex),full.list.map(x=>x.rowIndex));
    for(const summary of compact.list) {
      const expected=full.list.find(row=>row.rowIndex===summary.rowIndex);
      for(const key of ['status','round','unit','totalScore','judgeName','team','role','mode','participantName','stationClosed'])assert.deepEqual(summary[key],expected[key],key);
      assert.equal(summary.detailRequired,true);
      assert.equal(summary.comparisonAvailable,!!expected._stddev);
      assert.equal(summary.values,undefined);
      assert.equal(summary._stddev,undefined);
      assert.equal(summary['종합코멘트'],undefined);
      assert.equal(summary.payload.rows,undefined);
      assert.ok(!Object.keys(summary).some(key=>/^_col\d/.test(key)));
      const detail=await api.rpc('getReviewList','KCR',{...actor,compactReview:true,detailRowIndex:summary.rowIndex});
      assert.deepEqual(detail.headers,full.headers);
      assert.deepEqual(detail.list,[expected],'authorized detail is byte-equivalent to the old full list item');
      comparisons++;
    }
  }
  assert.equal(snapshot(),before,'all compact/detail reads preserve persisted scores/comments/tags/locks');
  const own=await api.rpc('getReviewList','KCR',judges[1]);
  const target=own.list[0];
  const deny=async(actor,id)=>{
    const response=await(await api.handle({action:'getReviewList',args:['KCR',{...actor,detailRowIndex:id}]})).json();
    assert.equal(response.success,false,'unauthorized or invalid detail rejected');
  };
  await deny(outsider,target.rowIndex);
  await deny(freshHead,target.rowIndex);
  await deny(judges[1],target.rowIndex+':1');
  await deny(judges[1],-1);
  await deny(judges[1],999999);
  await deny({...judges[1],round:'결선'},target.rowIndex);
  await deny({...judges[1],calibrationOnly:true},target.rowIndex);
  const details=await api.rpc('getReviewList','KCR',{...judges[1],detailRowIndex:target.rowIndex});
  await api.rpc('updateReviewRow','KCR',target.rowIndex,{[details.headers.indexOf('종합코멘트')]:'상세 조회 후 직접 수정한 코멘트'},'수정완료','',judges[1]);
  const saved=await api.rpc('getReviewList','KCR',{...judges[1],detailRowIndex:target.rowIndex});
  assert.equal(saved.list[0]['종합코멘트'],'상세 조회 후 직접 수정한 코멘트');
  assert.equal(saved.list[0]['총점'],target['총점']);
  assert.deepEqual(saved.list[0].payload.rows[0].extraFields.점수잠금,target.payload.rows[0].extraFields.점수잠금);
  const finalRow={...api.db.prepare('SELECT * FROM scores WHERE id=?').get(target.rowIndex)};
  delete finalRow.id;
  finalRow.round='결선';
  const finalPayload=JSON.parse(finalRow.payload_json);
  finalPayload.round='결선';finalPayload.currentRound='결선';
  delete finalPayload.kcrEvaluationKey;delete finalPayload.clientSubmissionId;
  finalPayload.rows[0].extraFields['결선 검수 메모']='유지할 결선 초안';
  finalRow.payload_json=JSON.stringify(finalPayload);
  const columns=Object.keys(finalRow);
  api.db.prepare(`INSERT INTO scores (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>finalRow[key]));
  for(const actor of [judges[1],{...api.actor,manageReview:true}]) {
    const fullFinal=(await api.rpc('getReviewList','KCR',actor)).list.find(row=>row.finalWorkflow);
    const compactFinal=(await api.rpc('getReviewList','KCR',{...actor,compactReview:true})).list.find(row=>row.finalWorkflow);
    assert.deepEqual(compactFinal,fullFinal,'historical final corrections retain their complete payload and column contract');
    assert.equal(compactFinal.detailRequired,undefined);
  }
  const cfg=api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get();
  const options=JSON.parse(cfg.option_settings);
  options.kcrStations.byRound.예선=options.kcrStations.byRound.예선.map((station,index)=>({...station,prelimDay:index<2?1:2}));
  options.kcrStations.stations=options.kcrStations.byRound.예선;
  options.kcrStations.closedPrelimDays=[1];
  api.db.prepare("UPDATE competitions SET option_settings=? WHERE code='KCR'").run(JSON.stringify(options));
  const beforeClosed=snapshot();
  await deny(judges[1],target.rowIndex);
  await deny(head2,target.rowIndex);
  for(const actor of [api.actor,lead]) {
    const scope={...actor,manageReview:true};
    const full=await api.rpc('getReviewList','KCR',scope);
    const compact=await api.rpc('getReviewList','KCR',{...scope,compactReview:true});
    assert.deepEqual(compact.list.map(row=>row.stationClosed),full.list.map(row=>row.stationClosed));
    const detail=await api.rpc('getReviewList','KCR',{...scope,detailRowIndex:target.rowIndex});
    assert.deepEqual(detail.headers,full.headers);
    assert.deepEqual(detail.list,[full.list.find(row=>row.rowIndex===target.rowIndex)]);
    assert.equal(detail.list[0].stationClosed,true);
  }
  assert.equal(snapshot(),beforeClosed);
  const kbc=await api.rpc('getReviewList','KBC',api.actor);
  assert.deepEqual(await api.rpc('getReviewList','KBC',{...api.actor,compactReview:true,detailRowIndex:99999}),kbc,'other competitions ignore KCR opt-ins');
  const scope={...api.actor,manageReview:true};
  const full=await api.rpc('getReviewList','KCR',scope),compact=await api.rpc('getReviewList','KCR',{...scope,compactReview:true});
  const fullBytes=Buffer.byteLength(JSON.stringify(full)),compactBytes=Buffer.byteLength(JSON.stringify(compact));
  assert.ok(compactBytes<fullBytes*.4,'compact lists omit duplicated detail and comparison payloads');
  console.log(JSON.stringify({test:'Stage243 KCR compact/detail parity, header-safe edits, blind authorization and closed-day isolation',comparisons,fullBytes,compactBytes}));
}finally{api.close();}
