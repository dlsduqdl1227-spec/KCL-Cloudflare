export const MOC_FINAL_RESULT_KEY='moc_final_official_ranks_20261114_v1';
// Random verification key, independent of every participant and result.
// Its signing key is discarded after signing the one authorized private plan.
export const MOC_FINAL_RESULT_PUBLIC_KEY={"kty":"EC","x":"6Z11kJKqPklkHH_iGMxABF04KKFXhNVfnDkr-O3s77M","y":"PwV8-nuv-MAr0f1gJRq0ZNZNSt4dBZhj-UU_J0Is730","crv":"P-256"};
const key=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
export async function verifyMocFinalResultPlan(plan,publicKey=MOC_FINAL_RESULT_PUBLIC_KEY){
  if(!plan||plan.version!==1||!/^[a-f0-9]{64}$/.test(plan.nonce||'')||!Array.isArray(plan.entries)||plan.entries.length!==10)return false;
  if(plan.entries.some((e,i)=>e.rank!==i+1||typeof e.name!=='string'||!e.name.trim()||e.name.length>50)||new Set(plan.entries.map(e=>key(e.name))).size!==10)return false;
  const canonical=JSON.stringify({version:1,nonce:plan.nonce,entries:plan.entries.map(e=>({rank:e.rank,name:e.name}))});
  if(typeof plan.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(plan.signature))return false;
  try{
    const verifier=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const bytes=Uint8Array.from(atob(plan.signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verifier,bytes,new TextEncoder().encode(canonical));
  }catch{return false;}
}
export async function applyMocFinalResult(db,entries){
  const saved=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(MOC_FINAL_RESULT_KEY).first();
  if(saved){try{return JSON.parse(saved.setting_value).status==='applied';}catch{return false;}}
  if(!Array.isArray(entries)||entries.length!==10||entries.some((e,i)=>e.rank!==i+1)||new Set(entries.map(e=>key(e.name))).size!==10)return false;
  const rows=(await db.prepare("SELECT id,name,unique_no,prelim_cup_no,main_cup_no,final_cup_no,updated_at FROM participants WHERE competition_code='MOC' ORDER BY id").all()).results||[];
  const cfg=await db.prepare("SELECT id,current_round,updated_at FROM competitions WHERE code='MOC'").first();if(!cfg)return false;
  const plan=[];
  for(const e of entries){
    const matches=rows.filter(r=>key(r.name)===key(e.name));if(matches.length!==1)return false;
    const r=matches[0],unit=String(r.final_cup_no||r.main_cup_no||r.unique_no||r.prelim_cup_no||'').trim();
    if(!unit||plan.some(p=>p.unit===unit)||rows.some(other=>other.id!==r.id&&String(other.final_cup_no||'').trim()===unit))return false;
    plan.push({participantId:r.id,rank:e.rank,unit,previousFinalNo:r.final_cup_no,previousUpdatedAt:r.updated_at});
  }
  const stamp=new Date().toISOString(),receipt=JSON.stringify({version:1,status:'applied',round:'결선',source:'주최측 수기 최종 결과',appliedAt:stamp,operationId:crypto.randomUUID(),previousRound:cfg.current_round,entries:plan});
  const insert=db.prepare(`WITH original AS (SELECT value FROM json_each(?)), safe AS (SELECT 1 WHERE
    (SELECT COUNT(*) FROM participants WHERE competition_code='MOC')=(SELECT COUNT(*) FROM original)
    AND EXISTS(SELECT 1 FROM competitions WHERE code='MOC' AND id=? AND current_round IS ? AND updated_at IS ?)
    AND NOT EXISTS(SELECT 1 FROM original o LEFT JOIN participants r ON r.id=json_extract(o.value,'$.id') WHERE r.id IS NULL OR r.competition_code<>'MOC'
      OR r.name IS NOT json_extract(o.value,'$.name') OR r.unique_no IS NOT json_extract(o.value,'$.unique_no') OR r.prelim_cup_no IS NOT json_extract(o.value,'$.prelim_cup_no')
      OR r.main_cup_no IS NOT json_extract(o.value,'$.main_cup_no') OR r.final_cup_no IS NOT json_extract(o.value,'$.final_cup_no') OR r.updated_at IS NOT json_extract(o.value,'$.updated_at')))
    INSERT OR IGNORE INTO system_settings(setting_key,setting_value,updated_at) SELECT ?,?,? FROM safe`).bind(JSON.stringify(rows),cfg.id,cfg.current_round,cfg.updated_at,MOC_FINAL_RESULT_KEY,receipt,stamp);
  const update=db.prepare(`WITH plan AS (SELECT json_extract(value,'$.participantId') id,json_extract(value,'$.unit') unit FROM json_each(?)) UPDATE participants
    SET final_cup_no=(SELECT unit FROM plan WHERE id=participants.id),updated_at=? WHERE competition_code='MOC' AND id IN(SELECT id FROM plan) AND TRIM(COALESCE(final_cup_no,''))=''
    AND EXISTS(SELECT 1 FROM system_settings WHERE setting_key=? AND setting_value=?)`).bind(JSON.stringify(plan),stamp,MOC_FINAL_RESULT_KEY,receipt);
  const round=db.prepare("UPDATE competitions SET current_round='결선',updated_at=? WHERE code='MOC' AND EXISTS(SELECT 1 FROM system_settings WHERE setting_key=? AND setting_value=?)").bind(stamp,MOC_FINAL_RESULT_KEY,receipt);
  await db.batch([insert,update,round]);
  const result=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(MOC_FINAL_RESULT_KEY).first();
  if(!result)return false;try{return JSON.parse(result.setting_value).status==='applied';}catch{return false;}
}
