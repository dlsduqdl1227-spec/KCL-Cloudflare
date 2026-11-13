// One deployment-authorized reversal; participant numbers and scores stay intact.
export const KBC_FINAL_ORDER_KEY='kbc_final_order_20261113_reverse_v1';
const key=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const completed=new WeakSet(),running=new WeakMap();
const slotKeys=['date','day','station','backroomTime','waitingTime','preparationTime','performanceTime','interviewTime','cleanupTime','reentryTime','endTime'];
const extra=row=>JSON.parse(row.extra_json||'{}');
const schedule=row=>extra(row).roundSchedules?.결선||{};
const order=row=>{const n=Number(schedule(row).order);return Number.isInteger(n)&&n>0?n:Number(row.final_cup_no);};
export async function reverseRequestedKbcFinalOrder(db,firstPerformer){
  if(typeof firstPerformer!=='string'||!firstPerformer.trim())return false;
  if(completed.has(db))return true;if(running.has(db))return running.get(db);
  const p=apply(db,firstPerformer).then(ok=>{if(ok)completed.add(db);return ok;}).finally(()=>running.delete(db));running.set(db,p);return p;
}
async function apply(db,firstPerformer){
  const saved=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(KBC_FINAL_ORDER_KEY).first();
  if(saved){try{return JSON.parse(saved.setting_value).status==='applied';}catch{return false;}}
  const rows=(await db.prepare("SELECT id,name,final_cup_no,extra_json,updated_at FROM participants WHERE competition_code='KBC' AND TRIM(COALESCE(final_cup_no,''))<>'' ORDER BY id").all()).results||[];
  if(rows.length!==6||new Set(rows.map(r=>String(r.final_cup_no).trim())).size!==6||rows.filter(r=>key(r.name)===key(firstPerformer)).length!==1)return false;
  if(rows.some(r=>!Number.isFinite(order(r))))return false;
  const current=rows.slice().sort((a,b)=>order(a)-order(b)||Number(a.final_cup_no)-Number(b.final_cup_no)||a.id-b.id);
  let next;
  if(key(current[0].name)===key(firstPerformer))next=current;
  else if(key(current.at(-1).name)===key(firstPerformer))next=current.slice().reverse();
  else return false;
  const changes=next.map((row,i)=>{
    const data=extra(row),assigned={...schedule(row)},slot=schedule(current[i]);
    // Reuse existing time slots so the first performer gets the first slot.
    // Participant-specific notes and other rounds remain on the same record.
    for(const field of slotKeys){if(Object.hasOwn(slot,field))assigned[field]=slot[field];else delete assigned[field];}
    assigned.order=i+1;assigned.dayOrder=i+1;
    data.roundSchedules={...data.roundSchedules,결선:assigned};
    return {id:row.id,extra:JSON.stringify(data),previousExtra:row.extra_json,previousUpdatedAt:row.updated_at,finalNumber:row.final_cup_no};
  });
  const stamp=new Date().toISOString(),receipt=JSON.stringify({version:1,status:'applied',appliedAt:stamp,operationId:crypto.randomUUID(),changes});
  const insert=db.prepare(`WITH original AS (SELECT value FROM json_each(?)), safe AS (SELECT 1 WHERE
    (SELECT COUNT(*) FROM participants WHERE competition_code='KBC' AND TRIM(COALESCE(final_cup_no,''))<>'')=6
    AND NOT EXISTS(SELECT 1 FROM original o LEFT JOIN participants r ON r.id=json_extract(o.value,'$.id')
      WHERE r.id IS NULL OR r.competition_code<>'KBC' OR r.name IS NOT json_extract(o.value,'$.name')
        OR r.final_cup_no IS NOT json_extract(o.value,'$.final_cup_no') OR r.extra_json IS NOT json_extract(o.value,'$.extra_json')
        OR r.updated_at IS NOT json_extract(o.value,'$.updated_at')))
    INSERT OR IGNORE INTO system_settings(setting_key,setting_value,updated_at) SELECT ?,?,? FROM safe`)
    .bind(JSON.stringify(rows),KBC_FINAL_ORDER_KEY,receipt,stamp);
  const update=db.prepare(`WITH plan AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.extra') extra FROM json_each(?))
    UPDATE participants SET extra_json=(SELECT extra FROM plan WHERE id=participants.id),updated_at=?
    WHERE competition_code='KBC' AND id IN(SELECT id FROM plan)
      AND EXISTS(SELECT 1 FROM system_settings WHERE setting_key=? AND setting_value=?)`)
    .bind(JSON.stringify(changes),stamp,KBC_FINAL_ORDER_KEY,receipt);
  await db.batch([insert,update]);
  const result=await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').bind(KBC_FINAL_ORDER_KEY).first();
  if(!result)return false;try{return JSON.parse(result.setting_value).status==='applied';}catch{return false;}
}
