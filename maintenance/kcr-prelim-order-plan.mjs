// Read-only plan builder. Execute its guarded SQL only after roster reconciliation
// and a private snapshot. Never renumber a competition with saved evaluations.
export function buildKcrPrelimOrderPlan(participants, selections, {source, timestamp}) {
  const rows = participants.filter(row => row.competition_code === 'KCR');
  if (!source || !timestamp || !rows.length || !selections.length) throw Error('배정 근거와 시각, 확정 선수가 필요합니다.');
  const sorted = selections.slice().sort((a,b) => a.number-b.number);
  const byId = new Map();
  sorted.forEach((item,index) => {
    if (Number(item.number) !== index+1 || byId.has(Number(item.id))) throw Error('확정 번호 또는 선수 연결이 중복되거나 누락되었습니다.');
    if (!rows.some(row => Number(row.id) === Number(item.id))) throw Error('KCR에 등록된 선수만 배정할 수 있습니다.');
    byId.set(Number(item.id), item);
  });
  const numberAliases = ['고유번호','unique_no','uniqueNo','참가자번호','선수번호','번호','예선참가번호',
    '예선컵번호','prelim_cup_no','prelimCupNo','예선번호','예선출품번호','예선샘플번호','예선팀번호','예선블라인드번호',
    '컵번호','cup_no','cupNo','출품번호','샘플번호','sample_no','sampleNo','팀번호','team_no','teamNo'];
  const plan = rows.map(old => {
    const selected = byId.get(Number(old.id));
    const number = selected ? String(selected.number) : '';
    const extra = JSON.parse(old.extra_json || '{}');
    const originalNumbers = extra.kcrPrelimImport?.originalNumbers || Object.fromEntries(
      ['unique_no','prelim_cup_no','cup_no','sample_no','team_no'].map(key => [key,old[key]]));
    const originalAliases = extra.kcrPrelimImport?.originalAliases || Object.fromEntries(numberAliases.filter(key => key in extra).map(key => [key,extra[key]]));
    numberAliases.forEach(key => { delete extra[key]; });
    if (number) extra['예선참가번호'] = number;
    extra.kcrPrelimPending = !selected;
    extra.kcrPrelimImport = {source, importedAt:timestamp, providedName:selected?.name || '', originalNumbers, originalAliases};
    return {old,number,nextExtra:JSON.stringify(extra)};
  });
  const quote = value => "'"+String(value).replace(/'/g,"''")+"'";
  const columns = ['id','competition_code','name','affiliation','phone','unique_no','prelim_cup_no','main_cup_no','final_cup_no','cup_no','sample_no','team_name','team_no','extra_json','created_at','updated_at'];
  const statement = `WITH plan AS MATERIALIZED (SELECT json_extract(value,'$.old') AS old,
    json_extract(value,'$.old.id') AS id,json_extract(value,'$.number') AS number,
    json_extract(value,'$.nextExtra') AS next_extra FROM json_each(?)),
    safe AS MATERIALIZED (SELECT 1 WHERE
      (SELECT COUNT(*) FROM participants WHERE competition_code='KCR')=${rows.length}
      AND (SELECT COUNT(*) FROM plan p JOIN participants r ON ${columns.map(key => `r.${key} IS json_extract(p.old,'$.${key}')`).join(' AND ')})=${rows.length}
      AND NOT EXISTS(SELECT 1 FROM scores WHERE competition_code='KCR'))
    UPDATE participants SET unique_no=(SELECT number FROM plan WHERE id=participants.id),
      prelim_cup_no=(SELECT number FROM plan WHERE id=participants.id),cup_no='',sample_no='',team_no='',
      extra_json=(SELECT next_extra FROM plan WHERE id=participants.id),updated_at=${quote(timestamp)}
    WHERE competition_code='KCR' AND id IN(SELECT id FROM plan) AND EXISTS(SELECT 1 FROM safe);`;
  const params = [JSON.stringify(plan)];
  const sql = statement.replace('json_each(?)', `json_each(${quote(params[0])})`);
  return {plan,sql,statement,params,assigned:selections.length,pending:rows.length-selections.length};
}
