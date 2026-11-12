import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const token=actor=>({judgeToken:actor.judgeToken});
const raw=(api,action,...args)=>api.handle({action,args}).then(r=>r.json());
const snapshot=api=>JSON.stringify(api.db.prepare("SELECT * FROM scores ORDER BY id").all());
const rank=async api=>(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit==='A-1');
async function setup(api){
  const data=await seedIkrcFinal(api),ids=data.judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
  api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
  for(let i=0;i<data.judges.length;i++)await api.rpc('submitScores',ikrcFinalSubmission(data.judges[i],data.stations[0],i?6:10));
  const old=api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' AND judge_name=? AND unit='A-1'").get(data.judges[1].name);
  const original=JSON.parse(old.payload_json),legacy=structuredClone(original);delete legacy.finalEvaluationKey;delete legacy.clientSubmissionId;delete legacy.operatorIdentityKey;delete legacy.judgeIdentityKey;delete legacy.judgePhone;delete legacy.operatorPhone;
  api.db.prepare('UPDATE scores SET payload_json=?,role=? WHERE id=?').run(JSON.stringify(legacy),'심사위원',old.id);
  const current={...old};delete current.id;current.submitted_at=new Date(Date.parse(old.submitted_at)+1000).toISOString();current.role='센서리 심사위원';current.total_score=80;
  const p=structuredClone(original);delete p.clientSubmissionId;for(const i of [1,3,5,7,9])p.rows[0].data[i]=8;p.rows[0].data[12]=80;p.rows[0].extraFields['종합코멘트']='최근 평가 원문';p.totalScore=80;
  current.payload_json=JSON.stringify(p);const columns=Object.keys(current);const inserted=api.db.prepare('INSERT INTO scores('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(k=>current[k]));
  await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(data.participants[0].id),expectedSavedAt:''},3,'QA seed',api.actor);
  return {...data,oldId:old.id,newId:Number(inserted.lastInsertRowid)};
}
async function history(api,id){return api.rpc('getIkrcScoreHistory',{round:'결선',rowIndex:id},token(api.actor));}
async function select(api,reference,id){const h=await history(api,reference);return api.rpc('selectIkrcOfficialScore',{round:'결선',rowIndex:reference,selectedRowIndex:id,historyRevision:h.historyRevision},token(api.actor));}
async function review(api,actor=api.actor){return api.rpc('getReviewList','IKRC',{...token(actor),round:'결선',reviewScope:actor===api.actor?'manage':'own'});}
async function returnItem(api,id){const r=await review(api),item=r.list.find(x=>String(x.rowIndex)===String(id));assert.ok(item);return api.rpc('returnFinalEvaluations',{competitionCode:'IKRC',round:'결선',reason:'원문 재확인',entries:[{rowIndex:item.rowIndex,revision:item.finalRevision}]},token(api.actor));}

test('legacy name-only and current account records are one sensory vote with a visible history',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId,judges}=await setup(api),h=await history(api,newId),r=await rank(api);
    assert.equal(h.entries.length,2);assert.equal(h.entries.find(e=>e.rowIndex===newId).isSelected,true);assert.equal(h.entries.find(e=>e.rowIndex===oldId).isSelected,false);
    assert.equal(r.confirmedJudgeCount,5);assert.equal(r.avgScore,64);assert.equal(r.rankingScore,67);assert.ok(!r.sensoryJudgeNames.includes(judges[0].name));
    const list=await review(api);const items=list.list.filter(e=>e.judgeName===judges[1].name&&e.unit==='A-1');assert.equal(items.length,1);assert.equal(items[0].ikrcHistoryCount,2);
  }finally{api.close();}
});
test('selecting the earlier evaluation changes ranking, detail, monitor and debrief once without rewriting scores',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId,judges,stations}=await setup(api),before=snapshot(api);await select(api,newId,oldId);
    const r=await rank(api);assert.equal(r.confirmedJudgeCount,5);assert.equal(r.avgScore,60);assert.equal(r.rankingScore,63);assert.equal(snapshot(api),before);
    const selected=await history(api,newId);assert.equal(selected.entries.filter(e=>e.isSelected).length,1);assert.equal(selected.entries.find(e=>e.isSelected).rowIndex,oldId);
    const own=await review(api,judges[1]);assert.equal(own.list.find(e=>e.unit==='A-1').rowIndex,oldId);
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,60);assert.equal(detail.rows.length,5);
    const monitor=await api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',{scope:'station',stationId:stations[0].id},judges[0]);assert.equal(monitor.finalAverage,60);assert.equal(monitor.judgeCount,5);
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.rankInfo.avgScore,60);assert.equal(preview.scores.length,6);
  }finally{api.close();}
});
test('returning the selected old evaluation never revives its newer unselected duplicate; resubmission updates the chosen vote',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId,judges}=await setup(api);await select(api,newId,oldId);await returnItem(api,oldId);
    assert.equal((await rank(api)).confirmedJudgeCount,4);
    const own=await review(api,judges[1]),item=own.list.find(e=>e.rowIndex===oldId),col=own.headers.indexOf('Flavor(플레이버) ×3');assert.equal(item.status,'반려');
    const unchosen=api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(newId).payload_json;
    await api.rpc('resubmitFinalEvaluations',{competitionCode:'IKRC',round:'결선',entries:[{rowIndex:oldId,revision:item.finalRevision,updates:{[col]:9}}]},token(judges[1]));
    const r=await rank(api);assert.equal(r.confirmedJudgeCount,5);assert.equal(r.avgScore,61.8);assert.equal(r.rankingScore,64.8);assert.equal(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(newId).payload_json,unchosen);
  }finally{api.close();}
});
test('without a manual selection a returned latest evaluation does not resurrect its older duplicate',async()=>{
  const api=await createRpcFixture();try{
    const {newId}=await setup(api);await returnItem(api,newId);const r=await rank(api);assert.equal(r.confirmedJudgeCount,4);assert.equal(r.avgScore,60);
  }finally{api.close();}
});

test('an already-open editor cannot silently update an evaluation that is no longer selected',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId}=await setup(api),h=await history(api,newId),revision=h.entries.find(e=>e.rowIndex===newId).revision;
    const r=await review(api),col=r.headers.indexOf('Flavor(플레이버) ×3');await select(api,newId,oldId);const before=snapshot(api);
    const result=await raw(api,'resubmitFinalEvaluations',{competitionCode:'IKRC',round:'결선',entries:[{rowIndex:newId,revision,updates:{[col]:9}}]},token(api.actor));
    assert.equal(result.success,false);assert.equal(result.stale,true);assert.match(result.message,/선택 상태/);assert.equal(snapshot(api),before);assert.equal((await rank(api)).avgScore,60);
  }finally{api.close();}
});

test('a virtual cup can be selected from a historical multi-cup record without changing another cup selection',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId,judges}=await setup(api);
    const legacyRows=api.db.prepare("SELECT * FROM scores WHERE judge_name=? AND id<>? ORDER BY id").all(judges[1].name,newId),container=JSON.parse(legacyRows[0].payload_json),second={...legacyRows[1]};
    container.rows=legacyRows.map(r=>JSON.parse(r.payload_json).rows[0]);api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(container),oldId);
    for(const row of legacyRows.slice(1))api.db.prepare('DELETE FROM scores WHERE id=?').run(row.id);
    delete second.id;const p=JSON.parse(second.payload_json);delete p.clientSubmissionId;for(const i of [1,3,5,7,9])p.rows[0].data[i]=9;p.rows[0].data[12]=90;p.totalScore=90;
    second.payload_json=JSON.stringify(p);second.total_score=90;second.submitted_at=new Date(Date.parse(second.submitted_at)+1000).toISOString();const keys=Object.keys(second);api.db.prepare('INSERT INTO scores('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>second[k]));
    const h=await history(api,newId);assert.ok(h.entries.some(e=>e.rowIndex===oldId+':0'));const before=snapshot(api);await select(api,newId,oldId+':0');
    const rows=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;assert.equal(rows.find(r=>r.unit==='A-1').avgScore,60);assert.equal(rows.find(r=>r.unit==='A-2').avgScore,66);assert.ok(rows.every(r=>r.confirmedJudgeCount===5));assert.equal(snapshot(api),before);
  }finally{api.close();}
});
test('history selection requires manager access and rejects heads, other judges and stale histories',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId,judges}=await setup(api),h=await history(api,newId);
    assert.equal((await raw(api,'getIkrcScoreHistory',{round:'결선',rowIndex:newId},token(judges[1]))).success,false);
    const head=api.db.prepare("SELECT id FROM scores WHERE judge_name=? AND unit='A-1'").get(judges[0].name).id,hh=await history(api,head);
    assert.equal((await raw(api,'selectIkrcOfficialScore',{round:'결선',rowIndex:head,selectedRowIndex:head,historyRevision:hh.historyRevision},token(api.actor))).success,false);
    assert.equal((await raw(api,'selectIkrcOfficialScore',{round:'결선',rowIndex:newId,selectedRowIndex:head,historyRevision:h.historyRevision},token(api.actor))).success,false);
    await select(api,newId,oldId);
    const stale=await raw(api,'selectIkrcOfficialScore',{round:'결선',rowIndex:newId,selectedRowIndex:newId,historyRevision:h.historyRevision},token(api.actor));assert.equal(stale.success,false);assert.equal(stale.stale,true);
  }finally{api.close();}
});
test('a concurrent selection change rejects correction atomically and preserves every score and pending input',async()=>{
  let change=null;
  const api=await createRpcFixture({beforeBatch:async()=>{if(change){const f=change;change=null;f();}}});
  try{
    const {oldId,newId,judges}=await setup(api);await select(api,newId,oldId);await returnItem(api,oldId);
    const own=await review(api,judges[1]),item=own.list.find(e=>e.rowIndex===oldId),col=own.headers.indexOf('Flavor(플레이버) ×3'),before=snapshot(api);
    change=()=>{const s=api.db.prepare("SELECT token,payload_json FROM sessions WHERE kind='IKRC_OFFICIAL_SELECTION'").get();const p=JSON.parse(s.payload_json);p.rowIndex=String(newId);api.db.prepare('UPDATE sessions SET payload_json=? WHERE token=?').run(JSON.stringify(p),s.token);};
    const result=await raw(api,'resubmitFinalEvaluations',{competitionCode:'IKRC',round:'결선',entries:[{rowIndex:oldId,revision:item.finalRevision,updates:{[col]:9}}]},token(judges[1]));
    assert.equal(result.success,false);assert.equal(snapshot(api),before);assert.match(result.message,/동시에|변경/);
  }finally{api.close();}
});

test('a score edit racing the history selection prevents a stale selection without overwriting that edit',async()=>{
  let change=null;const api=await createRpcFixture({beforeBatch:async()=>{if(change){const f=change;change=null;f();}}});
  try{
    const {oldId,newId}=await setup(api),h=await history(api,newId);
    change=()=>api.db.prepare('UPDATE scores SET total_score=79 WHERE id=?').run(newId);
    const result=await raw(api,'selectIkrcOfficialScore',{round:'결선',rowIndex:newId,selectedRowIndex:oldId,historyRevision:h.historyRevision},token(api.actor));
    assert.equal(result.success,false);assert.equal(result.stale,true);assert.equal(api.db.prepare('SELECT total_score FROM scores WHERE id=?').get(newId).total_score,79);
    assert.equal(api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='IKRC_OFFICIAL_SELECTION'").get().n,0);
  }finally{api.close();}
});

class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.style={};this.attributes={};this.listeners={};this._value='';this._text='';this.disabled=false;this.checked=false;}
  appendChild(child){child.parentElement=this;this.children.push(child);return child;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set value(value){this._value=String(value);}
  get value(){return this._value || (this.tagName==='SELECT'&&this.children[0]?this.children[0].value:'');}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(k,fn){this.listeners[k]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;if(this.listeners.close)this.listeners.close();}
  get isConnected(){return this.tagName==='BODY'||!!this.parentElement?.isConnected;}
  get firstElementChild(){return this.children[0];}
  querySelector(selector){return descendants(this).find(x=>selector[0]==='.'?String(x.className||'').split(' ').includes(selector.slice(1)):x.tagName===selector.toUpperCase())||null;}
}
function descendants(el){return el.children.flatMap(x=>[x,...descendants(x)]);}
function historyUi(api){
  const body=new Element('body'),pending=[],toasts=[],calls=[],drafts=new Map([['evaluation-in-progress','원래 점수와 코멘트']]);
  const document={body,createElement:tag=>new Element(tag),getElementById:id=>descendants(body).find(x=>x.id===id)||null};
  function invoke(action,args,success,failure){const promise=raw(api,action,...args).then(success).catch(failure);pending.push(promise);}
  const google={script:{get run(){return {withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getIkrcScoreHistory(...args){invoke('getIkrcScoreHistory',args,this.success,this.failure);},selectIkrcOfficialScore(...args){invoke('selectIkrcOfficialScore',args,this.success,this.failure);}};}}};
  const c=vm.createContext({document,google,_judge:api.actor,_reviewState:{code:'IKRC',finalRound:'결선',name:'IKRC',backPanel:'pAdmin'},reviewManageScopeForCode_:()=>true,finalCorrectionItems_:item=>item._reviewGroupItems||[item],activePanelId_:()=> 'pReview',reviewActorPayload_:()=>token(api.actor),toast:message=>toasts.push(message),goReviewByCode:(...args)=>calls.push(args),localStorage:{setItem(){throw new Error('history selection cannot modify evaluation drafts');},removeItem(){throw new Error('history selection cannot remove evaluation drafts');},clear(){throw new Error('history selection cannot clear storage');}}});
  vm.runInContext(fs.readFileSync(new URL('../public/assets/ikrc-score-history.js',import.meta.url),'utf8'),c);
  return {c,document,drafts,toasts,calls,async settle(){while(pending.length)await Promise.all(pending.splice(0));}};
}
test('history chooser opens the past evaluations and selects exactly one through the real API while preserving drafts',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId}=await setup(api),r=await review(api),item=r.list.find(x=>x.rowIndex===newId),ui=historyUi(api);
    const row=new Element('div'),info=new Element('div'),actions=new Element('div');actions.className='review-actions';row.appendChild(info);row.appendChild(actions);ui.document.body.appendChild(row);
    ui.c.appendIkrcHistoryButton_(row,item);const open=actions.children.find(x=>x.textContent==='과거 평가 비교·선택');assert.ok(open);open.onclick();await ui.settle();
    const dialog=ui.document.getElementById('ikrc-score-history-dialog');assert.ok(dialog.open);const inputs=descendants(dialog).filter(x=>x.tagName==='INPUT');assert.equal(inputs.length,2);
    const past=inputs.find(x=>x.value===String(oldId));past.checked=true;past.onchange();descendants(dialog).find(x=>x.tagName==='BUTTON'&&x.textContent==='이 평가 1건만 선택').onclick();await ui.settle();
    assert.equal(ui.document.getElementById('ikrc-score-history-dialog'),null);assert.equal(ui.calls.length,1);assert.equal((await rank(api)).avgScore,60);assert.equal((await rank(api)).confirmedJudgeCount,5);assert.equal(ui.drafts.get('evaluation-in-progress'),'원래 점수와 코멘트');
  }finally{api.close();}
});
test('history chooser retains its context on stale selection and requires a fresh user choice',async()=>{
  const api=await createRpcFixture();try{
    const {oldId,newId}=await setup(api),r=await review(api),ui=historyUi(api);ui.c.openIkrcScoreHistory_([r.list.find(x=>x.rowIndex===newId)]);await ui.settle();
    const dialog=ui.document.getElementById('ikrc-score-history-dialog'),save=descendants(dialog).find(x=>x.tagName==='BUTTON'&&x.textContent==='이 평가 1건만 선택');
    await select(api,newId,oldId);save.onclick();await ui.settle();assert.ok(dialog.isConnected);assert.equal(save.disabled,true);assert.equal(ui.calls.length,0);assert.match(dialog.textContent,/변경/);assert.equal((await rank(api)).avgScore,60);assert.equal(ui.drafts.get('evaluation-in-progress'),'원래 점수와 코멘트');
  }finally{api.close();}
});
