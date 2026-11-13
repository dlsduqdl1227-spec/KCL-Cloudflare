import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';

const source=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);return source.slice(start,source.indexOf('\nfunction ',start+1));};
const ctx=vm.createContext({_reviewState:{},_rankingDetail:{compCode:'KBC'},_selComp:null});
vm.runInContext(`function escHtml(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtScore(v){return String(Number(v));}
function displayJudgeLabel_(name,role,fallback){return name||fallback;}
function detailMediaHtml_(){return '';}
function detailMobHeaderApplies_(){return true;}
`+['scoreMaxForLabel','displayScoreWithMax','normalizeDisplayVal','isSmartTagHeader','isKbcLegacyRemovedHeader_','isDetailScoreHeader','isOverallReportCommentLabel_','isDetailCommentHeader','isDetailBaseHeader','isDisqualificationHeader','isDisqualificationReasonHeader','isDetailResultHeader','detailFieldHtml','kbcPresentationDetailField_','renderDetailCard'].map(extract).join('\n'),ctx);

test('the ranking detail renderer includes canonical and legacy KBC presentation scores, zero, authored comments and tags',()=>{
  for(const header of ['Service Professionalism(서비스의 전문성)','Service Professionalism','Presentation','Presentation & Service','프레젠테이션']){
    for(const score of [4.2,0]){
      const row={[header]:score,[header+' 코멘트']:'직접 작성한 설명 <보존>',[header+' 스마트태그']:'내용 전달 명확'};
      const html=ctx.renderDetailCard(row,Object.keys(row),0,'KBC');
      assert.match(html,/프레젠테이션·서비스 전문성/);assert.ok(html.includes(score+' / 5'));
      assert.match(html,/프레젠테이션·서비스 코멘트/);assert.match(html,/직접 작성한 설명 &lt;보존&gt;/);
      assert.match(html,/프레젠테이션·서비스 스마트태그/);assert.match(html,/내용 전달 명확/);
    }
  }
  assert.doesNotMatch(ctx.renderDetailCard({'Service Professionalism':4.2},['Service Professionalism'],0,'MOC'),/프레젠테이션|4\.2/,'other competition rules remain unchanged');
  for(const header of ['Presentation participantName','Presentation 연락처','Service Professionalism 서명'])assert.equal(ctx.kbcPresentationDetailField_(header),null);
});

test('the actual ranking-detail API supplies presentation for every KBC round without changing scores, ranks or participants',async()=>{
  const api=await createAllDebriefFixture();try{
    for(const row of api.db.prepare("SELECT id,payload_json FROM scores WHERE competition_code='KBC'").all()){
      const payload=JSON.parse(row.payload_json);Object.assign(payload.rows[0].extraFields,{'Service Professionalism(서비스의 전문성)':4.2,'Service Professionalism 코멘트':'발표 의도에 대한 원문','Service Professionalism 스마트태그':'의도 전달 명확'});
      api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
    }
    const snapshot=()=>JSON.stringify(['scores','participants','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
    const before=snapshot(),rankBefore=await api.rpc('getRanking','KBC',api.actor),c=api.cases.find(c=>c.code==='KBC');
    for(const [index,round] of c.rounds.entries()){
      const detail=await api.rpc('getRankingDetail','KBC',c.units[index],round,api.actor);
      assert.equal(detail.round,round);assert.ok(detail.rows.length);
      const html=detail.rows.map((row,i)=>ctx.renderDetailCard(row,detail.headers,i,'KBC')).join('');
      assert.match(html,/프레젠테이션·서비스 전문성/);assert.match(html,/4\.2 \/ 5/);assert.match(html,/발표 의도에 대한 원문/);assert.match(html,/의도 전달 명확/);
    }
    assert.equal(snapshot(),before);assert.deepEqual(await api.rpc('getRanking','KBC',api.actor),rankBefore);
  }finally{api.close();}
});
