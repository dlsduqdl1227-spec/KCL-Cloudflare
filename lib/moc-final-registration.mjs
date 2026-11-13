// One deployment-authorized data correction, requested on 2026-11-13.
// Names identify existing MOC participants. Their supplied final ranks are NOT
// competition numbers, score overrides, or performance-order instructions.
export const MOC_FINAL_REGISTRATION_KEY='moc_final_participants_20261113_v1';
const nameKey=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const text=value=>String(value??'').trim();
const completed=new WeakSet(),running=new WeakMap();
export async function markRequestedMocFinalParticipants(db,names){
  if(!Array.isArray(names)||names.length!==10||new Set(names.map(nameKey)).size!==10)return false;
  if(completed.has(db))return true;
  if(running.has(db))return running.get(db);
  const pending=apply(db,names).then(ok=>{if(ok)completed.add(db);return ok;}).finally(()=>running.delete(db));
  running.set(db,pending);return pending;
}
async function apply(db,names){
  const prior=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(MOC_FINAL_REGISTRATION_KEY).first();
  if(prior){try{return JSON.parse(prior.setting_value).status==='applied';}catch{return false;}}
  const participants=(await db.prepare("SELECT id,name,unique_no,prelim_cup_no,main_cup_no,final_cup_no,updated_at FROM participants WHERE competition_code='MOC' ORDER BY id").all()).results||[];
  const scores=(await db.prepare("SELECT id,unit,participant_name,mode,round FROM scores WHERE competition_code='MOC' AND round='결선' ORDER BY id").all()).results||[];
  const official=scores.filter(r=>!/calib|켈리|캘리/i.test(text(r.mode)));
  const plan=[];
  for(const providedName of names){
    const matches=participants.filter(r=>nameKey(r.name)===nameKey(providedName));
    if(matches.length!==1)return false;
    const row=matches[0],savedNumber=text(row.final_cup_no);
    const recorded=[...new Set(official.filter(s=>nameKey(s.participant_name)===nameKey(row.name)).map(s=>text(s.unit)).filter(Boolean))];
    if(!savedNumber&&recorded.length>1)return false;
    const number=savedNumber||recorded[0]||text(row.main_cup_no)||text(row.unique_no)||text(row.prelim_cup_no);
    if(!number||plan.some(p=>p.number===number)||participants.some(r=>r.id!==row.id&&text(r.final_cup_no)===number))return false;
    if(official.some(s=>text(s.unit)===number&&nameKey(s.participant_name)&&nameKey(s.participant_name)!==nameKey(row.name)))return false;
    plan.push({id:row.id,number,previousFinalNo:row.final_cup_no,previousUpdatedAt:row.updated_at});
  }
  const stamp=new Date().toISOString(),operationId=crypto.randomUUID();
  const receipt=JSON.stringify({version:1,status:'applied',appliedAt:stamp,operationId,changes:plan});
  // Snapshot guards and the durable receipt are checked inside the same atomic
  // D1 batch. Concurrent roster/score-identity edits make the entire plan a no-op.
  const insert=db.prepare(`WITH p AS (SELECT value FROM json_each(?)), s AS (SELECT value FROM json_each(?)),
    plan AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.number') number FROM json_each(?)),
    safe AS (SELECT 1 WHERE
      (SELECT COUNT(*) FROM participants WHERE competition_code='MOC')=(SELECT COUNT(*) FROM p)
      AND NOT EXISTS(SELECT 1 FROM p LEFT JOIN participants r ON r.id=json_extract(p.value,'$.id') WHERE r.id IS NULL OR r.competition_code<>'MOC'
        OR r.name IS NOT json_extract(p.value,'$.name') OR r.updated_at IS NOT json_extract(p.value,'$.updated_at')
        OR r.unique_no IS NOT json_extract(p.value,'$.unique_no') OR r.prelim_cup_no IS NOT json_extract(p.value,'$.prelim_cup_no')
        OR r.main_cup_no IS NOT json_extract(p.value,'$.main_cup_no') OR r.final_cup_no IS NOT json_extract(p.value,'$.final_cup_no'))
      AND (SELECT COUNT(*) FROM scores WHERE competition_code='MOC' AND round='결선')=(SELECT COUNT(*) FROM s)
      AND NOT EXISTS(SELECT 1 FROM s LEFT JOIN scores r ON r.id=json_extract(s.value,'$.id') WHERE r.id IS NULL OR r.competition_code<>'MOC'
        OR r.round IS NOT json_extract(s.value,'$.round') OR r.unit IS NOT json_extract(s.value,'$.unit')
        OR r.participant_name IS NOT json_extract(s.value,'$.participant_name') OR r.mode IS NOT json_extract(s.value,'$.mode'))
      AND NOT EXISTS(SELECT 1 FROM participants r JOIN plan ON TRIM(COALESCE(r.final_cup_no,''))=plan.number AND r.id<>plan.id WHERE r.competition_code='MOC'))
    INSERT OR IGNORE INTO system_settings(setting_key,setting_value,updated_at) SELECT ?,?,? FROM safe`)
    .bind(JSON.stringify(participants),JSON.stringify(scores),JSON.stringify(plan),MOC_FINAL_REGISTRATION_KEY,receipt,stamp);
  const update=db.prepare(`WITH plan AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.number') number FROM json_each(?))
    UPDATE participants SET final_cup_no=(SELECT number FROM plan WHERE id=participants.id),updated_at=?
    WHERE competition_code='MOC' AND id IN(SELECT id FROM plan) AND TRIM(COALESCE(final_cup_no,''))=''
      AND EXISTS(SELECT 1 FROM system_settings WHERE setting_key=? AND setting_value=?)`)
    .bind(JSON.stringify(plan),stamp,MOC_FINAL_REGISTRATION_KEY,receipt);
  await db.batch([insert,update]);
  const result=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(MOC_FINAL_REGISTRATION_KEY).first();
  if(!result)return false;
  try{return JSON.parse(result.setting_value).status==='applied';}catch{return false;}
}
