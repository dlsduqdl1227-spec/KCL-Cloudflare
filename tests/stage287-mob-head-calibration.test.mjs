import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMobCalibrationFixture,strictShimRpc} from './helpers/mob-calibration-fixture.mjs';

for (const [key, judgeCount, role] of [['sensoryHead',2,'센서리 헤드 심사위원'],['technicalHead',1,'테크니컬 헤드 심사위원'],['multiroleHead',2,'센서리 헤드 심사위원']]) {
  test('MOB '+key+' list and detail survive the strict production API transport',async()=>{
    const api=await createMobCalibrationFixture();
    try {
      const shim=strictShimRpc(api), actor=api.actors[key], token=actor.judgeToken;
      const list=await shim.rpc('getMobCalibrationParticipantNumbers','A조',role,token);
      assert.equal(list.success,true);
      assert.deepEqual(list.numbers.map(x=>x.participantNo),['1']);
      assert.equal(list.numbers[0].judgeCount,judgeCount);
      const detail=await shim.rpc('getMobCalibrationResultsByParticipant','1','A조',role,token);
      assert.equal(detail.success,true);
      assert.equal(detail.rows.filter(x=>!x.isHeadCalibration).length,judgeCount);
      assert.equal(detail.rows.filter(x=>x.isHeadCalibration).length,1);
      assert.ok(detail.rows.every(x=>x.participantNo==='1'&&x.comment==='확인할 심사 코멘트'));
      assert.deepEqual(shim.calls,['getMobCalibrationParticipantNumbers','getMobCalibrationResultsByParticipant']);
    } finally {api.close();}
  });
}

test('head completion persists, stays reopenable, and never changes official scores or the other category',async()=>{
  const api=await createMobCalibrationFixture();
  try {
    const before=api.snapshot(), shim=strictShimRpc(api), head=api.actors.sensoryHead, role=head.roleMap.MOB;
    for(let n=0;n<2;n++) assert.equal((await shim.rpc('markMobCalibrationChecked','1','A조',head.name,role,head.judgeToken)).success,true);
    const list=await shim.rpc('getMobCalibrationParticipantNumbers','A조',role,head.judgeToken);
    assert.equal(list.numbers[0].checked,true);
    assert.equal(list.numbers[0].checkerName,head.name);
    const tech=api.actors.technicalHead;
    const other=await shim.rpc('getMobCalibrationParticipantNumbers','B조',tech.roleMap.MOB,tech.judgeToken);
    assert.equal(other.numbers[0].checked,false);
    assert.equal((await shim.rpc('getMobCalibrationResultsByParticipant','1','A조',role,head.judgeToken)).rows.length,3);
    assert.equal(api.snapshot(),before);
    assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE kind='MOB_CALIBRATION_CHECK'").get().n,1);
  } finally {api.close();}
});

test('empty lists and details are valid successful responses without retry storms',async()=>{
  const api=await createMobCalibrationFixture();
  try {
    api.db.prepare("DELETE FROM scores WHERE competition_code='MOB'").run();
    const shim=strictShimRpc(api),head=api.actors.sensoryHead;
    assert.deepEqual((await shim.rpc('getMobCalibrationParticipantNumbers','A조',head.roleMap.MOB,head.judgeToken)).numbers,[]);
    assert.deepEqual((await shim.rpc('getMobCalibrationResultsByParticipant','1','A조',head.roleMap.MOB,head.judgeToken)).rows,[]);
    assert.equal(shim.calls.length,2);
  } finally {api.close();}
});

test('ordinary judges and heads of other competitions cannot read or complete MOB head checks',async()=>{
  const api=await createMobCalibrationFixture();
  try {
    const before=api.snapshot(),shim=strictShimRpc(api);
    for(const actor of [api.actors.judge,api.actors.otherHead]) {
      assert.equal((await shim.rpc('getMobCalibrationParticipantNumbers','A조','센서리 헤드 심사위원',actor.judgeToken)).success,false);
      assert.equal((await shim.rpc('getMobCalibrationResultsByParticipant','1','A조','센서리 헤드 심사위원',actor.judgeToken)).success,false);
      assert.equal((await shim.rpc('markMobCalibrationChecked','1','A조',actor.name,'센서리 헤드 심사위원',actor.judgeToken)).success,false);
    }
    assert.equal(api.snapshot(),before);
    assert.equal(shim.calls.length,6);
  } finally {api.close();}
});

const html=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
function fn(name) {
  const start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  const next=html.slice(start+1).search(/^function\s/m);
  return next<0?html.slice(start):html.slice(start,start+1+next);
}

test('MOB head menus keep the general final-review route hidden',()=>{
  const buttons={};
  for(const id of ['btn-review','btn-calibration','btn-eval'])buttons[id]={style:{},textContent:''};
  const context={_selComp:{code:'MOB',currentRound:'결선'},_judge:{name:'헤드 QA'},document:{getElementById:id=>buttons[id]||null,querySelectorAll:()=>[]},
    isHeadRoleForCode_:()=>true,isTeamLeaderForCode_:()=>false,isAdminRole:()=>false,canCalibrationCode_:()=>true,canReviewCode_:()=>true,
    judgeTeamText:()=> 'A조',finalRoundForCode_:()=> '결선',isIkrcFinalConfig_:()=>false,isStaffRoleForCode_:()=>false};
  vm.createContext(context);vm.runInContext(fn('updateSelectReviewButton_'),context);context.updateSelectReviewButton_();
  assert.equal(buttons['btn-review'].style.display,'none');
  assert.equal(buttons['btn-calibration'].style.display,'block');
});

test('MOB permission failures remain visible instead of becoming an empty list or detail',()=>{
  for(const method of ['loadMobCalibrationTargets','openMobCalibrationDetail']) {
    const elements={};
    for(const id of ['mob-cal-list','mob-cal-sub','mob-cal-detail','mob-cal-detail-title','mob-cal-detail-sub'])elements[id]={innerHTML:'',textContent:''};
    let success;const notices=[];
    const runner={withSuccessHandler(fn){success=fn;return runner;},withFailureHandler(){return runner;},
      getMobCalibrationParticipantNumbers(){success({success:false,message:'MOB 확인 권한이 만료되었습니다.'});},
      getMobCalibrationResultsByParticipant(){success({success:false,message:'MOB 확인 권한이 만료되었습니다.'});}};
    const context={_judge:{judgeToken:'local-qa-token'},_selComp:{code:'MOB',currentRound:'결선'},document:{getElementById:id=>elements[id]},
      google:{script:{run:runner}},isMobHeadCategoryMissing_:()=>false,judgeLineText:()=>'',mobCalibrationLabel_:()=>'',mobCalibrationTeamArg_:()=>'',mobRoleText_:()=>'',
      mobCalItem_:x=>x,showPanel(){},showOverlay(){},hideOverlay(){},toast:(message)=>notices.push(message),escHtml:s=>String(s)};
    vm.createContext(context);
    if(html.includes('function mobCalibrationLoadError_('))vm.runInContext(fn('mobCalibrationLoadError_'),context);
    vm.runInContext(fn(method),context);context[method]('1');
    const body=elements[method==='loadMobCalibrationTargets'?'mob-cal-list':'mob-cal-detail'].innerHTML;
    assert.match(body,/MOB 확인 권한이 만료/);
    assert.doesNotMatch(body,/현재 확인할 일반 심사위원 제출 데이터가 없습니다/);
    assert.ok(notices.some(x=>x.includes('권한이 만료')));
  }
});
