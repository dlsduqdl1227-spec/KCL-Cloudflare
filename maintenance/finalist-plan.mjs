// Generate a guarded, single-statement finalist assignment. This module performs
// no network calls; an operator must inspect the plan before executing its SQL.
export function buildFinalistPlan(participants, selections, {numbering, source, timestamp}) {
  if (!['rank','reverse-rank','existing'].includes(numbering)) throw Error('참가번호 배정 기준을 선택해주세요.');
  if (!source || !timestamp || !selections.length) throw Error('배정 근거와 시각, 대상이 필요합니다.');
  const ids=new Set(),numbers=new Set();
  const counts=new Map();
  for(const item of selections)counts.set(item.code,(counts.get(item.code)||0)+1);
  if(numbering==='reverse-rank')for(const [code,count] of counts){
    const ranks=selections.filter(s=>s.code===code).map(s=>s.rank).sort((a,b)=>a-b);
    if(ranks.some((rank,i)=>rank!==i+1))throw Error('역순 배정에는 대회별 전체 진출 순위가 필요합니다.');
  }
  const plan=selections.map(item=>{
    const row=participants.find(p=>Number(p.id)===Number(item.id)&&p.competition_code===item.code);
    if(!row||ids.has(row.id))throw Error('대회별 선수 연결이 없거나 중복되었습니다.');
    ids.add(row.id);
    const round=['MOC','KBC'].includes(item.code)?'본선':'결선';
    if(item.round!==round)throw Error('첫 결선 경기 회차가 일치하지 않습니다.');
    const column=round==='본선'?'main_cup_no':'final_cup_no';
    const number=String(numbering==='reverse-rank'?counts.get(item.code)-item.rank+1:numbering==='rank'?item.rank:row.prelim_cup_no||row.team_no||row.unique_no||'').trim();
    if(!number)throw Error('배정할 참가번호가 없습니다.');
    const key=item.code+'|'+round+'|'+number;
    if(numbers.has(key))throw Error('같은 대회·회차의 참가번호가 중복되었습니다.');
    numbers.add(key);
    if(row[column])throw Error('기존 결선 배정은 자동으로 덮어쓰지 않습니다.');
    if(participants.some(p=>p.competition_code===item.code&&p[column]===number))throw Error('이미 사용 중인 결선 참가번호입니다.');
    const extra=JSON.parse(row.extra_json||'{}');
    extra.roundSchedules={...extra.roundSchedules};
    if(!extra.roundSchedules[round])extra.roundSchedules[round]={date:'',day:'',team:''};
    extra.roundSchedules[round]={...extra.roundSchedules[round],order:Number(number)||item.rank};
    extra.finalistSelections={...extra.finalistSelections,[round]:{qualificationRank:item.rank,source,assignedAt:timestamp,providedName:item.name,providedAffiliation:item.affiliation}};
    return {id:row.id,code:item.code,round,column,number,name:row.name,oldExtra:row.extra_json,oldUpdatedAt:row.updated_at,oldMain:row.main_cup_no,oldFinal:row.final_cup_no,nextExtra:JSON.stringify(extra)};
  });
  const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
  // Every selected row and destination number is rechecked in the same UPDATE.
  // Any concurrent edit, new final score or conflicting assignment makes the
  // entire statement a no-op, not a partial import. Other columns stay intact.
  const sql=`WITH plan AS (SELECT
    json_extract(value,'$.id') AS id, json_extract(value,'$.code') AS code,
    json_extract(value,'$.round') AS round, json_extract(value,'$.number') AS number,
    json_extract(value,'$.name') AS name, json_extract(value,'$.oldExtra') AS old_extra,
    json_extract(value,'$.oldUpdatedAt') AS old_updated, json_extract(value,'$.oldMain') AS old_main,
    json_extract(value,'$.oldFinal') AS old_final, json_patch(json_extract(value,'$.oldExtra'),json_extract(value,'$.patch')) AS next_extra
    FROM json_each(${quote(JSON.stringify(plan.map(p=>{
      const extra=JSON.parse(p.nextExtra);
      const {nextExtra,...rest}=p;
      return {...rest,patch:{roundSchedules:{[p.round]:extra.roundSchedules[p.round]},finalistSelections:{[p.round]:extra.finalistSelections[p.round]}}};
    })))})),
  eligible AS (SELECT p.id FROM plan p JOIN participants r ON r.id=p.id AND r.competition_code=p.code
    WHERE r.name IS p.name AND r.extra_json IS p.old_extra AND r.updated_at IS p.old_updated
    AND r.main_cup_no IS p.old_main AND r.final_cup_no IS p.old_final),
  safe AS (SELECT 1 WHERE (SELECT COUNT(*) FROM eligible)=${plan.length}
    AND NOT EXISTS(SELECT 1 FROM scores s JOIN plan p ON s.competition_code=p.code AND s.round=p.round)
    AND NOT EXISTS(SELECT 1 FROM participants r JOIN plan p ON r.competition_code=p.code
      AND (CASE WHEN p.round='본선' THEN r.main_cup_no ELSE r.final_cup_no END)=p.number))
  UPDATE participants SET
    main_cup_no=CASE WHEN (SELECT round FROM plan WHERE id=participants.id)='본선' THEN (SELECT number FROM plan WHERE id=participants.id) ELSE main_cup_no END,
    final_cup_no=CASE WHEN (SELECT round FROM plan WHERE id=participants.id)='결선' THEN (SELECT number FROM plan WHERE id=participants.id) ELSE final_cup_no END,
    extra_json=(SELECT next_extra FROM plan WHERE id=participants.id),updated_at=${quote(timestamp)}
  WHERE id IN (SELECT id FROM plan) AND EXISTS(SELECT 1 FROM safe);`;
  return {plan,sql};
}
