import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

const html=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
const debrief=fs.readFileSync(new URL('../public/debriefing/index.html',import.meta.url),'utf8');
function fn(source,name) {
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const next=source.slice(start+1).search(/\n(?:async )?function\s/);
  return source.slice(start,next<0?source.length:start+1+next);
}
const definitions=html.slice(html.indexOf('var MOB_TECH = ['),html.indexOf('var MOB_SMART_TAGS ='));
const canonical=['Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Post-Service Station(시연 후 작업대)'];
const retired=['Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)'];
function definitionsContext(extra={}) {const c=vm.createContext({...extra});vm.runInContext(definitions,c);return c;}

test('MOB final technical criteria match the four-item paper sheet in the original order',()=>{
  const c=definitionsContext();
  assert.deepEqual(Array.from(c.mobTechnicalAttrs_(true),a=>a.name),canonical);
  assert.deepEqual(Array.from(c.mobTechnicalAttrs_(true),a=>a.label),['시연 전 작업대 청결 및 관리','시연 중 작업대 청결 및 관리','부재료 사용의 적절함(시그니처)','시연 후 작업대 청결 및 관리']);
  assert.equal(c.MOB_SIG_TECH.length,1);
  assert.equal(c.mobTechnicalAttrs_(false).length,3,'preliminary brewing has no signature-ingredient criterion');
});

test('technical judges and technical heads render only four scored inputs in the final',()=>{
  for(const head of [false,true]) {
    const elements={};
    const el=id=>elements[id]||(elements[id]={value:'',innerHTML:'',textContent:'',style:{},classList:{remove(){}},options:[{value:'브루잉'},{value:'창작'}]});
    const c=definitionsContext({_selComp:{currentRound:'결선'},document:{getElementById:el},
      judgeLineText:()=>'',mobRoleText_:()=>head?'테크니컬 헤드 심사위원':'테크니컬 심사위원',evaluationPurposeDisplayLabel_:()=>'',evaluationTeamContextText_:()=>'',
      mobCreateTagState_:()=>({}),mobGetDesc:()=>'',mobCommentId_:id=>id+'-comment',mobScoreLockHtml_:()=>'',renderMobInlineTagSection_:()=>'',MOB_SCORE_LABELS:{},
      escHtml:s=>String(s),setVal_:(id,v)=>{el(id).value=v;},resetEvaluationDisqualification_(){},updateMobTimeStatus_(){},configureMobCommentUi_(){},
      mobCreativeAllowed_:()=>true,isMobCalibrationMode_:()=>head,isMobTechnicalOnly_:()=>true,isMobSensoryOnly_:()=>false,isMobHeadCategoryMissing_:()=>false,
      refreshParticipantAssignmentsForActiveComp_(){},isMobHeadRole_:()=>head,mobCalibrationLabel_:()=>'',calcMobTotal(){},showEval(){},renderEvaluationDisqualification_(){},renderMobSmartTags(){},toast(){}
    });
    for(const name of ['makeScoreRow','toggleMobSig','startMob'])vm.runInContext(fn(html,name),c);
    c.startMob();
    const rendered=el('mob-tech-rows').innerHTML;
    assert.equal((rendered.match(/type="range"/g)||[]).length,4);
    assert.doesNotMatch(rendered,/id="mob-st[124]"/);
    assert.equal(el('mob-menu').value,'창작','final head calibration must include the fourth criterion too');
    assert.equal(el('mob-sig-tech-block').style.display,'block');
    assert.match(el('mob-tech-title').textContent,/4개 항목.*20점/);
    const order=['id="mob-t1"','id="mob-t2"','id="mob-st3"','id="mob-t3"'].map(id=>rendered.indexOf(id));
    assert.ok(order.every((n,i)=>n>=0&&(!i||n>order[i-1])));
  }
});

function totalContext(technical=true,creative=true) {
  const c=definitionsContext({document:{getElementById:id=>id==='mob-menu'?{value:creative?'창작':'브루잉'}:id.startsWith('v-')||id.startsWith('d-')?null:{value:5}},
    isMobTechnicalOnly_:()=>technical,isMobSensoryOnly_:()=>!technical,roundScore02:Number,roundTotal:n=>Math.round(n*10)/10,fmtScore:String,mobGetDesc:()=>'',val_:()=>''});
  vm.runInContext(fn(html,'mobScoreBreakdown_'),c);return c;
}
test('four technical scores have a 20-point maximum and ignore obsolete duplicate inputs',()=>{
  const b=totalContext().mobScoreBreakdown_();
  assert.equal(b.technicalTotal,20);assert.equal(b.grossTotal,20);assert.equal(b.officialTotal,20);
});
test('the correction preserves preliminary technical and sensory scoring',()=>{
  assert.equal(totalContext(true,false).mobScoreBreakdown_().technicalTotal,15);
  const b=totalContext(false,true).mobScoreBreakdown_();
  assert.equal(b.technicalTotal,0);assert.equal(b.sensoryTotal,30);assert.equal(b.creativeTotal,25);
});

test('submission, review, ranking and head comparison use four technical scores without deleting old fields',async()=>{
  const api=await createRpcFixture();
  try {
    await api.rpc('updateCompetitionAdminSettings',{code:'MOB',currentRound:'결선',isActive:true},api.actor);
    await api.rpc('upsertParticipant',{competitionCode:'MOB',name:'네 항목 QA 선수',phone:'01079992880',uniqueNo:'4',prelimCupNo:'4',finalCupNo:'4'},api.actor);
    const actors=[];
    for(const [name,phone,role]of [['테크 네 항목 QA','01079992881','테크니컬 심사위원'],['테크 헤드 네 항목 QA','01079992882','테크니컬 헤드 심사위원']]) {
      await api.rpc('upsertOperatorAccount',{name,phone,role,access:'MOB',accountType:'JUDGE'},api.actor);
      actors.push(await api.rpc('judgeLogin',name,phone));
    }
    const extra=Object.fromEntries(canonical.concat(retired).map(h=>[h,5]));
    extra['종합코멘트']='원본 보존과 네 항목 합산 확인';
    const payload={competitionCode:'MOB',round:'결선',judgeToken:actors[0].judgeToken,judgeName:actors[0].name,judgeRole:actors[0].roleMap.MOB,mode:'judge',rows:[{data:['4','창작'],extraFields:extra}]};
    await api.rpc('submitScores',payload);
    const review=await api.rpc('getReviewList','MOB',api.actor);
    assert.equal(review.list[0]['테크니컬 총점'],20);assert.equal(review.list[0]['총점'],20);
    const ranking=await api.rpc('getRanking','MOB',api.actor);
    assert.equal(ranking.ranking.length,1);
    assert.equal(ranking.ranking[0].totalScore??ranking.ranking[0].score??ranking.ranking[0].total,20);
    const detail=await api.rpc('getMobCalibrationResultsByParticipant','4','','테크니컬 헤드 심사위원',actors[1].judgeToken);
    assert.equal(detail.rows[0].technicalTotal,20);
    const stored=JSON.parse(api.db.prepare("SELECT payload_json FROM scores WHERE competition_code='MOB'").get().payload_json);
    for(const key of retired)assert.equal(stored.rows[0].extraFields[key],5,'keep historical raw values for audit');
    const index=review.headers.indexOf(canonical[0]);assert.ok(index>=0);
    await api.rpc('resubmitFinalEvaluations',{competitionCode:'MOB',round:'결선',entries:[{rowIndex:review.list[0].rowIndex,revision:review.list[0].finalRevision,updates:{[index]:4}}]},{judgeToken:api.actor.judgeToken});
    const edited=await api.rpc('getReviewList','MOB',api.actor);
    assert.equal(edited.list[0]['테크니컬 총점'],19);assert.equal(edited.list[0]['총점'],19);
    const reranked=(await api.rpc('getRanking','MOB',api.actor)).ranking[0];
    assert.equal(reranked.totalScore??reranked.score??reranked.total,19,'a review correction updates the same four-item total');
    const checked=await api.rpc('getMobCalibrationResultsByParticipant','4','','테크니컬 헤드 심사위원',actors[1].judgeToken);
    assert.equal(checked.rows[0].technicalTotal,19);
  }finally{api.close();}
});

test('head comparison, editable review and public debrief hide the three obsolete technical duplicates',()=>{
  const c=definitionsContext({_reviewState:{code:'MOB'},reviewMobRoleFlagsForItem_:()=>({onlyTech:true,onlySens:false}),reviewTextByNames_:()=> '창작'});
  vm.runInContext(fn(html,'reviewMobHeaderGroup_'),c);vm.runInContext(fn(html,'reviewMobHeaderAppliesToRole_'),c);
  c.mobRoleCategoryClient_=()=> 'technical';vm.runInContext(fn(html,'mobCalibrationAttrs_'),c);
  assert.deepEqual(Array.from(c.mobCalibrationAttrs_(),a=>a.key),['pre','service','signatureIngredientUse','post']);
  const p=vm.createContext({mobPublicCreativeApplies_:()=>true});
  for(const name of ['mobPublicRoleFlags_','mobPublicHeaderGroup_','mobPublicHeaderAppliesToRole_'])vm.runInContext(fn(debrief,name),p);
  const score={역할:'테크니컬 심사위원',메뉴:'창작',라운드:'결선'};
  for(const h of canonical){assert.equal(c.reviewMobHeaderAppliesToRole_(h,score),true,h);assert.equal(p.mobPublicHeaderAppliesToRole_(h,score),true,h);}
  for(const h of retired){assert.equal(c.reviewMobHeaderAppliesToRole_(h,score),false,h);assert.equal(p.mobPublicHeaderAppliesToRole_(h,score),false,h);}
  assert.equal(canonical.concat(retired).filter(h=>p.mobPublicHeaderAppliesToRole_(h,score)).length,4);
});
