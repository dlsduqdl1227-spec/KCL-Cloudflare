import assert from 'node:assert/strict';
import { onRequestPost } from './functions/api/rpc.js';

function norm(sql){ return String(sql).replace(/\s+/g,' ').trim(); }
function phone(v){ return String(v??'').replace(/[^0-9]/g,''); }
function normName(v){ return String(v??'').trim().replace(/\s+/g,'').toLowerCase(); }
function now(){ return new Date().toISOString(); }

class FakeD1 {
  constructor(){
    this.tables = { competitions:[], operators:[], sessions:[], scores:[], rate_limits:[], participants:[], otps:[], sms_logs:[], security_events:[] };
    this.ids = Object.fromEntries(Object.keys(this.tables).map(k=>[k,1]));
  }
  prepare(sql){ const db=this; return new Stmt(db, sql); }
  insert(table,row){ row={...row}; if (!('id' in row) && !['competitions','sessions','rate_limits'].includes(table)) row.id=this.ids[table]++; this.tables[table].push(row); return row; }
  seedOperator(row){ return this.insert('operators', {account_type:'JUDGE', name:'', affiliation:'', phone:'', access:'', team_group:'', role:'센서리 심사위원', created_at:now(), updated_at:now(), ...row, phone:phone(row.phone)}); }
}
class Stmt {
  constructor(db, sql){ this.db=db; this.sql=norm(sql); this.args=[]; }
  bind(...args){ this.args=args; return this; }
  async run(){ return this._exec('run'); }
  async all(){ return { results: this._exec('all') || [] }; }
  async first(){ const r=this._exec('first'); if (Array.isArray(r)) return r[0] || null; return r || null; }
  _exec(mode){
    const s=this.sql; const a=this.args; const db=this.db; const low=s.toLowerCase();
    if (low.startsWith('create table') || low.startsWith('create index')) return { success:true };
    if (low === 'select count(*) as n from competitions') return { n: db.tables.competitions.length };
    if (/insert into competitions/i.test(s)) { const [code,name,sheet,sms,updated]=a; db.insert('competitions',{ id:db.ids.competitions++, code, name, is_active:1, current_round:'예선', sheet_name:sheet, debriefing:0, sms_prefix:sms, option_settings:'{}', updated_at:updated }); return { success:true }; }
    if (/select count\(\*\) as n from operators where name='관리자'/i.test(s)) return { n: db.tables.operators.filter(o=>o.name==='관리자'&&o.phone==='01000000000'&&(o.account_type==='ADMIN'||o.role==='관리자'||o.access==='ALL')).length };
    if (/select count\(\*\) as n from operators where not/i.test(s)) return { n: db.tables.operators.filter(o=>!(o.name==='관리자'&&o.phone==='01000000000')).length };
    if (/delete from operators where name='관리자'/i.test(s)) { db.tables.operators=db.tables.operators.filter(o=>!(o.name==='관리자'&&o.phone==='01000000000'&&(o.account_type==='ADMIN'||o.role==='관리자'||o.access==='ALL'))); return { success:true }; }
    if (/select id from operators where name=\? and phone=\?/i.test(s)) { const [name, ph]=a; return db.tables.operators.find(o=>o.name===name&&o.phone===phone(ph)&&(o.account_type==='ADMIN'||o.access==='ALL'||/관리자|총괄/.test(o.role||''))) || null; }
    if (/update operators set account_type='admin'/i.test(s)) { const [aff, upd, id]=a; const o=db.tables.operators.find(x=>x.id===id); if(o) Object.assign(o,{account_type:'ADMIN',access:'ALL',role:'관리자',affiliation:aff,updated_at:upd}); return { success:true }; }
    if (/insert into operators/i.test(s)) {
      if (/values \('admin'/i.test(s)) { const [name, aff, ph, created, updated]=a; db.seedOperator({account_type:'ADMIN', name, affiliation:aff, phone:ph, access:'ALL', team_group:'', role:'관리자', created_at:created, updated_at:updated}); return { success:true }; }
      throw new Error('Unsupported operator insert: '+s);
    }
    if (/select \* from operators where phone=\? or name=\?/i.test(s)) { const [ph,n,norm]=a; return db.tables.operators.filter(o=>o.phone===phone(ph)||o.name===n||normName(o.name)===norm).sort((x,y)=>x.id-y.id); }
    if (/select \* from operators where phone=\?/i.test(s)) { const [ph]=a; return db.tables.operators.filter(o=>o.phone===phone(ph)).sort((x,y)=>x.id-y.id); }
    if (/insert into sessions/i.test(s)) { const [token,kind,payload_json,expires_at,created_at]=a; db.tables.sessions.push({token,kind,payload_json,expires_at,created_at}); return { success:true }; }
    if (/select payload_json from sessions where token=\?/i.test(s)) { const [token, date]=a; return db.tables.sessions.find(x=>x.token===token && x.expires_at>date) || null; }
    if (/select key, count, reset_at from rate_limits where key=\?/i.test(s)) { const [key]=a; return db.tables.rate_limits.find(x=>x.key===key) || null; }
    if (/insert or replace into rate_limits/i.test(s)) { const [key,count,reset_at,updated_at]=a; let r=db.tables.rate_limits.find(x=>x.key===key); if(!r){ r={key}; db.tables.rate_limits.push(r); } Object.assign(r,{count,reset_at,updated_at}); return { success:true }; }
    if (/update rate_limits set count=\?/i.test(s)) { const [count,updated_at,key]=a; let r=db.tables.rate_limits.find(x=>x.key===key); if(r) Object.assign(r,{count,updated_at}); return { success:true }; }
    if (/select current_round from competitions where code=\?/i.test(s)) { const [code]=a; const c=db.tables.competitions.find(x=>x.code===code); return c?{current_round:c.current_round}:null; }
    if (/select \* from competitions where code=\?/i.test(s)) { const [code]=a; return db.tables.competitions.find(x=>x.code===code)||null; }
    if (/select \* from competitions order by id/i.test(s)) return db.tables.competitions.slice().sort((x,y)=>x.id-y.id);
    if (/select id from scores where competition_code=\? and round=\?/i.test(s)) { const [code,round,judge,unit,payload_json,cutoff]=a; return db.tables.scores.find(x=>x.competition_code===code&&x.round===round&&x.judge_name===judge&&x.unit===String(unit)&&x.payload_json===payload_json&&x.submitted_at>cutoff) || null; }
    if (/insert into scores/i.test(s)) { const [submitted_at,competition_code,round,judge_name,team,role,mode,unit,participant_name,total_score,disqualified,disqualification_reason,payload_json,signature_data]=a; db.insert('scores',{submitted_at,competition_code,round,judge_name,team,role,mode,unit:String(unit),participant_name,total_score,disqualified,disqualification_reason,review_status:'미검수',payload_json,signature_data}); return { success:true }; }
    if (/select \* from scores where competition_code=\?/i.test(s)) { const [code]=a; let rows=db.tables.scores.filter(x=>x.competition_code===code); if (/order by id desc/i.test(s)) rows=rows.slice().sort((x,y)=>y.id-x.id); else rows=rows.slice().sort((x,y)=>x.id-y.id); return rows; }
    if (/select review_status from scores where id=\?/i.test(s)) { const [id,code]=a; const r=db.tables.scores.find(x=>x.id===Number(id)&&x.competition_code===code); return r?{review_status:r.review_status}:null; }
    if (/update scores set review_status=\?/i.test(s)) { const [status,id,code]=a; const r=db.tables.scores.find(x=>x.id===Number(id)&&x.competition_code===code); if(r) r.review_status=status; return { success:true }; }
    if (/select \* from scores where id=\? and competition_code=\?/i.test(s)) { const [id,code]=a; return db.tables.scores.find(x=>x.id===Number(id)&&x.competition_code===code)||null; }
    if (/update scores set unit=\?/i.test(s)) { const [unit,participant_name,total_score,disqualified,disqualification_reason,review_status,payload_json,id,code]=a; const r=db.tables.scores.find(x=>x.id===Number(id)&&x.competition_code===code); if(r) Object.assign(r,{unit,participant_name,total_score,disqualified,disqualification_reason,review_status,payload_json}); return {success:true}; }
    if (/delete from scores where id=\?/i.test(s)) { const [id,code]=a; db.tables.scores=db.tables.scores.filter(x=>!(x.id===Number(id)&&x.competition_code===code)); return {success:true}; }
    throw new Error('Unsupported SQL ['+mode+']: '+s+' ARGS '+JSON.stringify(a));
  }
}

const db = new FakeD1();
const env = { DB: db, KCL_ADMIN_NAME:'총괄관리자', KCL_ADMIN_PHONE:'01099990000', KCL_ADMIN_PASSWORD:'pw5061', KCL_ADMIN_SECRET_CODE:'5061' };
const url = 'https://kcl.test/api/rpc';
async function rpc(action, args=[]){
  const req = new Request(url, { method:'POST', headers:{'content-type':'application/json','Origin':'https://kcl.test'}, body:JSON.stringify({action,args}) });
  const res = await onRequestPost({request:req, env});
  const body = await res.json();
  if (!body.success) console.error('RPC failed', action, body);
  return body;
}
function dataObj(keys, values){ const o={}; keys.forEach((k,i)=>{ if(values[i]!==undefined && values[i]!==null && values[i]!=='') o[k]=values[i]; }); return o; }
const headers = {
  KCR:['컵번호','프로세스','Flavor(플레이버)','Flavor 강도','Aftertaste(애프터테이스트)','Aftertaste 지속성','Acidity(산미)','Acidity 강도','Body(바디)','Body 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Overall(주관적 종합평가)','종합코멘트','총점','실격여부','실격사유','검수상태'],
  KCAC:['참가자번호','선수명','우유종류','잔용도','우유명','예선 Pattern Completion(패턴 완성도)','예선 Pattern Balance(패턴 균형)','예선 Surface Quality(표면 품질)','예선 Position & Proportion(위치와 비율)','예선 Pattern Definition(패턴 선명도)','결선 Theme Expression(주제 표현력)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)','결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)','결선 Surface Quality(표면 품질)','결선 Position & Symmetry(위치와 대칭)','결선 Design Completion(디자인 완성도)','소계','감점','최종점수','가이드URL','종합코멘트','실격여부','실격사유','검수상태'],
  MOC:['참가자번호','평가구분','정답수','가산점','총점','종료시간','서명','실격여부','실격사유','검수상태','Section1 지정국가','Section2 지정국가','Section1 농장','Section1 발효방식','Section2 농장','Section2 발효방식','선수명'],
  KTCC:['팀번호','팀명','Section1 주제','Section1 선택컵','Section1 정답수','Section2 주제','Section2 선택컵','Section2 정답수','Section3 주제','Section3 선택컵','Section3 정답수','Section3 가산점','총점','종료시간','서명','실격여부','실격사유','검수상태'],
  IKRC:['샘플번호','Flavor(플레이버) ×3','Flavor 강도','Clean Cup(클린컵) ×2','Clean Cup 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Acidity(산미)','Acidity 강도','Mouthfeel(마우스필) ×2','Mouthfeel 강도','종합코멘트','총점','실격여부','검수상태','참가자 번호','선수명','Seed to Cup 가산점','Seed to Cup 메모','최종점수'],
  KBC:['참가자번호','Presentation & Service(프레젠테이션과 서비스 전문성)','Espresso Taste & Design(맛과 설계) ×2','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)','Espresso Total','Signature Taste & Design(맛과 설계) ×2','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)','Signature Total','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)','시간감점','총점','종합코멘트','실격여부','실격사유','검수상태','선수명','경기시간'],
  MOB:['참가자번호','메뉴','Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)','Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)','총점','종합코멘트','실격여부','실격사유','검수상태','시간감점','경기시간','선수명']
};
function row(code, values, extra={}, media=null){ const r={ data: values, extraFields: {...dataObj(headers[code], values), ...extra} }; if(media) r.media=media; return r; }
async function approve(code, ids, actor){ const r = await rpc('updateReviewStatusBatch', [code, ids, '검수완료', '', actor]); assert.equal(r.success,true, code+' approve'); }

// account setup and permission check
let admin = await rpc('adminLogin', ['총괄관리자','pw5061','5061']);
assert.equal(admin.success,true);
assert.equal(admin.accountType,'ADMIN');
db.seedOperator({account_type:'JUDGE', name:'테스트심사위원', phone:'01011112222', access:'KCR,KCAC,MOC,KTCC,IKRC,KBC,MOB', role:'센서리 심사위원', team_group:'A'});
db.seedOperator({account_type:'TEAMLEAD', name:'테스트팀장', phone:'01022223333', access:'KCR,KCAC,MOC,KTCC,IKRC,KBC,MOB', role:'대회팀장', team_group:'Lead'});
let judge = await rpc('judgeLogin', ['테스트심사위원','01011112222']);
let lead = await rpc('judgeLogin', ['테스트팀장','01022223333']);
assert.equal(judge.success,true); assert.equal(lead.success,true);
let denyReview = await rpc('getReviewList', ['KCR', judge]);
assert.equal(denyReview.success,false, 'judge must not access review list');

// KCR scoring + duplicate + tie sweetness
let kcr1 = {competitionCode:'KCR', judgeName:judge.name, judgeToken:judge.judgeToken, judgeRole:'센서리 심사위원', team:'A', mode:'judge', rows:[row('KCR',['101','Washed',4,'',4,'',4,'',4,'',5,'',4,'',0,'','','미검수'])]};
let kcr2 = {competitionCode:'KCR', judgeName:judge.name, judgeToken:judge.judgeToken, judgeRole:'센서리 심사위원', team:'A', mode:'judge', rows:[row('KCR',['102','Washed',4.4,'',4.4,'',4.4,'',4.4,'',4.8,'',2.8,'',0,'','','미검수'])]};
let r = await rpc('submitScores',[kcr1]); assert.equal(r.success,true); assert.equal(db.tables.scores.at(-1).total_score,30);
r = await rpc('submitScores',[kcr1]); assert.equal(r.success,true); assert.equal(r.inserted,0); // duplicate skipped
r = await rpc('submitScores',[kcr2]); assert.equal(r.success,true); assert.equal(db.tables.scores.at(-1).total_score,30);
await approve('KCR',[1,2], lead);
let rank = await rpc('getRanking',['KCR', lead]); assert.equal(rank.success,true); assert.equal(rank.ranking[0].unit,'101'); assert.equal(rank.ranking[0].totalScore,30);

// KCAC image storage + two-cup total
const media = { type:'KCAC_PATTERN_IMAGE', jarLabel:'FAST Rosetta', count:1, snapshots:[{label:'snap', thumb:'data:image/jpeg;base64,thumb', full:'data:image/jpeg;base64,full'}] };
let kcac = {competitionCode:'KCAC', judgeName:judge.name, judgeToken:judge.judgeToken, judgeRole:'패턴디자인 심사위원', team:'A', mode:'judge', rows:[
  row('KCAC',['201','라떼선수','멸균우유','예선 패턴평가','매일멸균우유',5,5,5,5,5,'','','','','','','','','',50,0,50,'','ok','','','미검수'], {'패턴종류':'FAST Rosetta','리프수':14}, media),
  row('KCAC',['201','라떼선수','대체우유','예선 패턴평가','어메이징 오트바리스타',4,4,4,4,4,'','','','','','','','','',40,0,40,'','ok','','','미검수'], {'패턴종류':'SLOW Rosetta','리프수':10}, media)
]};
r=await rpc('submitScores',[kcac]); assert.equal(r.success,true); const kcacId=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,90);
await approve('KCAC',[kcacId], lead);
let review=await rpc('getReviewList',['KCAC', lead]); assert.equal(review.success,true); assert.equal(review.list[0].mediaCount,2); assert.equal(review.list[0]['이미지저장'],'Y');
let detail=await rpc('getRankingDetail',['KCAC','201','예선', lead]); assert.equal(detail.success,true); assert.equal(detail.rows[0].payload.rows[0].media.snapshots[0].full.includes('data:image'),true);

// MOC signature + tie by shorter time
let mocA = {competitionCode:'MOC', judgeName:judge.name, judgeToken:judge.judgeToken, judgeRole:'운영진', team:'A', mode:'judge', rows:[row('MOC',['301','예선',4,1,0,'04:20','','','','미검수','','','','','','','MOC-A'])]};
let mocB = {competitionCode:'MOC', judgeName:judge.name, judgeToken:judge.judgeToken, judgeRole:'운영진', team:'A', mode:'judge', rows:[row('MOC',['302','예선',4,1,0,'04:10','','','','미검수','','','','','','','MOC-B'])]};
r=await rpc('submitWithSignature',[mocA,'data:image/png;base64,SIGN']); assert.equal(r.success,true); const mocAId=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,5); assert.ok(db.tables.scores.at(-1).signature_data.includes('SIGN'));
r=await rpc('submitWithSignature',[mocB,'data:image/png;base64,SIGN']); assert.equal(r.success,true); const mocBId=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,5);
await approve('MOC',[mocAId,mocBId], lead);
rank=await rpc('getRanking',['MOC', lead]); assert.equal(rank.ranking[0].unit,'302');
detail=await rpc('getRankingDetail',['MOC','301','예선', lead]); assert.equal(detail.rows[0].signatureData.includes('SIGN'),true);

// KTCC total + time tie
let kt1={competitionCode:'KTCC',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'운영진',team:'A',mode:'judge',rows:[row('KTCC',['401','팀A','same','A,B',2,'origin','C,D',2,'process','E,F',2,2,0,'07:40','','','','미검수'])]};
let kt2={competitionCode:'KTCC',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'운영진',team:'A',mode:'judge',rows:[row('KTCC',['402','팀B','same','A,B',2,'origin','C,D',2,'process','E,F',2,2,0,'07:20','','','','미검수'])]};
r=await rpc('submitWithSignature',[kt1,'data:image/png;base64,KTSIGN']); assert.equal(r.success,true); const kt1id=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,8);
r=await rpc('submitWithSignature',[kt2,'data:image/png;base64,KTSIGN']); assert.equal(r.success,true); const kt2id=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,8);
await approve('KTCC',[kt1id,kt2id], lead); rank=await rpc('getRanking',['KTCC',lead]); assert.equal(rank.ranking[0].unit,'402');

// IKRC weighted total + tie flavor
let ik1={competitionCode:'IKRC',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'센서리 심사위원',team:'A',mode:'judge',rows:[row('IKRC',['501',8,'',8,'',8,'',8,'',8,'','',0,'','미검수','501','IK-A',0,'',''])]};
r=await rpc('submitScores',[ik1]); assert.equal(r.success,true); const ikid=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,80); await approve('IKRC',[ikid],lead);

// KBC weighted total
let kbc={competitionCode:'KBC',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'헤드 심사위원',team:'A',mode:'judge',rows:[row('KBC',['601',5,5,5,5,5,'',4,4,4,4,'',5,2,0,'ok','','','미검수','KBC-A','06:50'])]};
r=await rpc('submitScores',[kbc]); assert.equal(r.success,true); const kbcid=db.tables.scores.at(-1).id; assert.equal(db.tables.scores.at(-1).total_score,53); await approve('KBC',[kbcid],lead);

// MOB category aggregation: tech avg + sensory avg + creative avg - penalty
let mobTech={competitionCode:'MOB',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'테크니컬 심사위원',team:'A',mode:'judge',rows:[row('MOB',['701','브루잉',4,4,4,'','','','','','','','','','','',0,'','','','미검수',0,'09:50','MOB-A'])]};
let mobSens={competitionCode:'MOB',judgeName:judge.name,judgeToken:judge.judgeToken,judgeRole:'센서리 심사위원',team:'A',mode:'judge',rows:[row('MOB',['701','브루잉','','','','5','5','5','5','5','5','4','4','4','4','4',0,'','','','미검수',2,'09:50','MOB-A'])]};
r=await rpc('submitScores',[mobTech]); assert.equal(r.success,true); const mtid=db.tables.scores.at(-1).id;
r=await rpc('submitScores',[mobSens]); assert.equal(r.success,true); const msid=db.tables.scores.at(-1).id;
await approve('MOB',[mtid,msid],lead); rank=await rpc('getRanking',['MOB',lead]); assert.equal(rank.ranking[0].unit,'701'); assert.equal(rank.ranking[0].totalScore,60); // tech 12 + sensory 30 + creative 20 - max penalty 2

// Final report contents: ranking + raw rows + approved rows, admin/teamlead authorized
let report=await rpc('getFinalReport',['KCAC',lead]); assert.equal(report.success,true); assert.equal(report.ranking[0].unit,'201'); assert.equal(report.rows[0]['이미지저장'],'Y'); assert.equal(report.approvedRows.length,1); assert.equal(report.rawRows[0].payload.rows[0].media.count,1);
let reportKcr=await rpc('getFinalReport',['KCR',admin]); assert.equal(reportKcr.success,true); assert.equal(reportKcr.ranking.length,2);
console.log('STAGE17_DIRECT_QA_PASS', JSON.stringify({scores:db.tables.scores.length, kcrTop:reportKcr.ranking[0].unit, kcacImages:review.list[0].mediaCount, mocSignature:detail.rows[0].signatureData?true:false}));
