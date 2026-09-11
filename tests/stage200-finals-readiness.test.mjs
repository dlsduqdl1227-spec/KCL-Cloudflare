import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Execute the real RPC implementation against an isolated in-memory D1 adapter.
// This test never connects to Cloudflare or modifies competition records.
const source = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const exported = ['onRequestPost','participantRoundNumber_','mobActiveParticipantDateFromConfig_',
  'canonicalScoreForPayload_','kcacSubtotalFromRaw_','aggregateRankingGroup_',
  'KCAC_QUAL_TOTAL_SPEC_','KCAC_FINAL_PATTERN_SPEC_','KCAC_FINAL_SENSORY_SPEC_'];
const api = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { ' + exported.filter(n => n !== 'onRequestPost').join(',') + ' };').toString('base64'));
class Statement {
  constructor(db, sql, params = []) { Object.assign(this, {db, sql, params}); }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  async first() { return this.db.prepare(this.sql).get(...this.params) || null; }
  async all() { return {results:this.db.prepare(this.sql).all(...this.params)}; }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return {success:true, meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; }
}
const db = new DatabaseSync(':memory:');
const env = {DB:{prepare:sql => new Statement(db, sql), async batch(statements) {
  db.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}}, KCL_ADMIN_NAME:'결선 QA', KCL_ADMIN_PHONE:'01099990000', KCL_ADMIN_PASSWORD:'qa-only', KCL_ADMIN_SECRET_CODE:'5061'};
let sequence = 0;
async function rpc(action, ...args) {
  const request = new Request('https://finals.test/api/rpc', {method:'POST', headers:{'Content-Type':'application/json',Origin:'https://finals.test','CF-Connecting-IP':`198.51.100.${++sequence % 200 + 1}`},body:JSON.stringify({action,args})});
  const response = await api.onRequestPost({request,env});
  assert.equal(response.status, 200, action);
  const result = await response.json();
  assert.equal(result.success, true, action + ': ' + result.message);
  return result;
}
await rpc('ping');
const admin = await rpc('adminLogin', '01099990000','qa-only','5061');
const actor = {judgeToken:admin.judgeToken,reviewScope:'manage',manageReview:true};
const codes = ['KBC','KCAC','KCR','IKRC','MOB','MOC','KTCC'];
for (const code of codes) {
  assert.equal(api.participantRoundNumber_({id:1,prelim_cup_no:'1'},code,'결선'),'', code + ': no preliminary-number fallback');
  assert.equal(api.participantRoundNumber_({prelim_cup_no:'1',final_cup_no:'8'},code,'결선'),'8');
  await rpc('upsertParticipant', {competitionCode:code,name:'예선 전용',phone:'01011112222',uniqueNo:'P1',prelimCupNo:'1'},actor);
  await rpc('upsertParticipant', {competitionCode:code,name:'진출 선수',phone:'01033334444',uniqueNo:'P2',prelimCupNo:'8',mainCupNo:'3',finalCupNo:'1'},actor);
  // An earlier MOB day/team must never hide finalists or label a final as August preliminaries.
  if (code === 'MOB') db.prepare("UPDATE participants SET extra_json=? WHERE competition_code='MOB'").run(JSON.stringify({'대회일':'2026-08-07','일정구분':'예선','심사조':'B조'}));
  await rpc('updateCompetitionAdminSettings',{code,currentRound:'결선',isActive:true,debriefing:false},actor);
  const assigned = await rpc('getParticipantAssignments',code,actor);
  assert.equal(assigned.assignments.length,1, code + ': only explicitly assigned finalists');
  assert.equal(assigned.assignments[0].number,'1');
  assert.equal(assigned.assignments[0].name,'진출 선수');
  if (code === 'MOB') assert.equal(assigned.assignments[0].competitionDate,'');
}
assert.equal(api.mobActiveParticipantDateFromConfig_({current_round:'결선',option_settings:JSON.stringify({mobActiveParticipantDate:'2026-08-07'})}), '');
const beforeCollision = db.prepare("SELECT * FROM participants WHERE competition_code='MOB' ORDER BY id").all();
async function rejected(action,...args) {
  const request = new Request('https://finals.test/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://finals.test','CF-Connecting-IP':'198.51.100.250'},body:JSON.stringify({action,args})});
  const result=await (await api.onRequestPost({request,env})).json();
  assert.equal(result.success,false);return result;
}
await rejected('upsertParticipant',{competitionCode:'MOB',name:'다른 선수',phone:'01012340000',uniqueNo:'P3',prelimCupNo:'9',finalCupNo:'1'},actor);
assert.deepEqual(db.prepare("SELECT * FROM participants WHERE competition_code='MOB' ORDER BY id").all(),beforeCollision,'a reused final number cannot overwrite another entrant');
await rpc('upsertParticipant',{competitionCode:'MOB',rowIndex:beforeCollision[1].id,name:'진출 선수',phone:'01033334444',uniqueNo:'P2',prelimCupNo:'8',finalCupNo:'1',extra:{'예선일':'2026-08-07',roundSchedules:{결선:{date:'2026-10-01'}}}},actor);
const finalSchedule=await rpc('getParticipantAssignments','MOB',actor);
assert.equal(finalSchedule.assignments[0].competitionDate,'2026-10-01');

function scores(spec, value) { return Object.fromEntries(spec.map(attr => [attr.keys[0],value])); }
const qual = scores(api.KCAC_QUAL_TOTAL_SPEC_,5);
const pattern = scores(api.KCAC_FINAL_PATTERN_SPEC_,5);
const sensory = scores(api.KCAC_FINAL_SENSORY_SPEC_,5);
assert.equal(api.kcacSubtotalFromRaw_({...qual,잔용도:'예선 패턴평가'}),50);
assert.equal(api.kcacSubtotalFromRaw_(pattern),60);
assert.equal(api.kcacSubtotalFromRaw_(sensory),20);
assert.equal(api.kcacSubtotalFromRaw_(scores(api.KCAC_FINAL_PATTERN_SPEC_,0)),0);

// Four actual head submissions: two pattern sheets and two two-cup sensory sheets.
const heads = [];
for (let i=0;i<4;i++) {
  const name='결선 헤드'+(i+1), phone='0107777000'+i;
  await rpc('upsertOperatorAccount',{accountType:'JUDGE',name,phone,access:'KCAC',role:'헤드 심사위원',teamGroup:'결선'},actor);
  heads.push(await rpc('judgeLogin',name,phone));
}
for (let i=0;i<4;i++) {
  const rows = i<2 ? [{data:['1'],extraFields:{...pattern,잔용도:'창작패턴평가',소계:60,시간감점:3,총점:57,종합코멘트:'패턴 기록',점수잠금:'{"완성도":true}'}}]
    : [{data:['1'],extraFields:{...sensory,잔용도:'센서리용아트',패턴종류:'sensory-regular',소계:20,총점:20,종합코멘트:'첫 잔 기록'}},
       {data:['1'],extraFields:{...sensory,잔용도:'센서리용아트',패턴종류:'sensory-oat',소계:20,시간감점:3,총점:17,종합코멘트:'둘째 잔 기록',점수잠금:'{"질감":true}'}}];
  await rpc('submitScores',{competitionCode:'KCAC',judgeToken:heads[i].judgeToken,judgeName:heads[i].name,judgeRole:'헤드 심사위원',mode:'judge',rows});
}
const review = await rpc('getReviewList','KCAC',actor);
assert.equal(review.list.length,6);
assert.equal(review.list.filter(r => r['종합코멘트']==='첫 잔 기록').length,2);
assert.equal(review.list.filter(r => r['종합코멘트']==='둘째 잔 기록').length,2);
assert.equal(review.list.filter(r => r['종합코멘트']==='패턴 기록').length,2);
assert.ok(review.list.some(r => r['점수잠금']==='{"질감":true}'));
await rpc('updateReviewStatusBatch','KCAC',review.list.map(r=>r.rowIndex),'검수완료','관리자',actor);
const ranking = await rpc('getRanking','KCAC',actor);
assert.equal(ranking.ranking.length,1);
assert.equal(ranking.ranking[0].score,97,'60 + 40 - 3: time penalty is deducted once across both panels');
assert.equal(ranking.ranking[0].playerNameSummary,'진출 선수','final number must not map to an eliminated preliminary entrant');
const originalRows = db.prepare('SELECT * FROM scores ORDER BY id').all();
const wrongRound=await rejected('submitScores',{competitionCode:'KCAC',round:'예선',judgeToken:heads[0].judgeToken,rows:[{data:['2'],extraFields:{Total:40}}]});
assert.match(wrongRound.message,/라운드/);
assert.deepEqual(db.prepare('SELECT * FROM scores ORDER BY id').all(),originalRows,'a stale preliminary screen must not create a final record');
await rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'예선',isActive:true,debriefing:false},actor);
await rpc('getParticipantAssignments','KCAC',actor);
assert.deepEqual(db.prepare('SELECT * FROM scores ORDER BY id').all(),originalRows,'round switching must not migrate or mutate submitted scores');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code!='KCAC'").get().n,0,'no cross-competition writes');

const total = (code,extra,round='결선') => api.canonicalScoreForPayload_(code,{competitionCode:code,round,rows:[{data:['1'],extraFields:extra}]});
assert.equal(total('KCR',{'Flavor':5,'Aftertaste':5,'Acidity':5,'Sweetness':5,'Mouthfeel':5,'Overall':5}),35);
assert.equal(total('IKRC',{'Flavor':10,'Clean Cup':10,'Sweetness':10,'Acidity':10,'Mouthfeel':10}),100);
assert.equal(total('IKRC',{'Flavor':10,'Clean Cup':10,'Sweetness':10,'Acidity':10,'Mouthfeel':10,'Seed to Cup 가산점':3}),103);
assert.equal(total('IKRC',{'Flavor':10,'Clean Cup':10,'Sweetness':10,'Acidity':10,'Mouthfeel':10,'Seed to Cup 가산점':3},'예선'),100);
const kbcKeys=['Service Professionalism(서비스의 전문성)','Espresso Taste & Design(맛과 설계) ×2','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)','Signature Taste & Design(맛과 설계) ×2','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)'];
assert.equal(total('KBC',Object.fromEntries(kbcKeys.map(k=>[k,5]))),60);
assert.equal(total('KBC',{...Object.fromEntries(kbcKeys.map(k=>[k,5])),시간감점:2}),58);
assert.equal(total('MOC',{정답수:4,가산점:3}),7);
assert.equal(total('KTCC',{'Section1 정답수':2,'Section2 정답수':2,'Section3 정답수':2}),8);
assert.equal(db.prepare('SELECT SUM(disqualified) AS n FROM scores').get().n,0);
db.close();
console.log('Stage200 rulebook finals, four-head KCAC aggregation, review persistence and seven-competition isolation passed.');
