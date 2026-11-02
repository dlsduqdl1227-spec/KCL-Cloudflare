import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Narrow, guarded maintenance path for the user-confirmed November timetable.
// Import the exact server schedule helpers, so the UI and this path cannot drift.
const source=fs.readFileSync('functions/api/rpc.js','utf8')+'\nexport {KBC_MAIN_TIMETABLE_2026_,kbcTimetableSlot_,normalizePersonName_};';
const {KBC_MAIN_TIMETABLE_2026_:table,kbcTimetableSlot_:slot,normalizePersonName_:normalize}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function query(sql){return JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:16*1024*1024}));}
const data=query("SELECT * FROM participants WHERE competition_code='KBC' ORDER BY id; SELECT COUNT(*) n FROM scores WHERE competition_code='KBC' AND round='본선';");
if(data.some(r=>!r.success))throw new Error('Incomplete read');
const participants=data[0].results,changes=[],ids=new Set();
const timestamp=new Date().toISOString();
let alreadyApplied=true;
table.days.forEach((day,d)=>day.names.forEach((name,i)=>{
  const matches=participants.filter(p=>normalize(p.name)===normalize(name));
  if(matches.length!==1)throw new Error('Ambiguous identity: '+name);
  const p=matches[0],number=String(d*10+i+1);
  if(ids.has(p.id)||p.main_cup_no!==number)throw new Error('Unexpected participant or main number: '+name);
  ids.add(p.id);
  const extra=JSON.parse(p.extra_json||'{}'),schedule={...slot(table.arrivals[i],day.day,day.date,i+1,i%2?'B':'A'),order:d*10+i+1};
  const previous=extra.roundSchedules?.본선||{};
  if(Object.entries(schedule).some(([k,v])=>previous[k]!==v))alreadyApplied=false;
  if(extra.kbcMainTimetableSource!=='2026-11-02-confirmed')extra.kbcMainTimetablePrevious={mainCupNo:p.main_cup_no||'',schedule:extra.roundSchedules?.본선||null};
  extra.roundSchedules={...extra.roundSchedules,본선:{...previous,...schedule}};
  extra.kbcMainTimetableSource='2026-11-02-confirmed';
  changes.push({id:p.id,extra:JSON.stringify(extra)});
}));
if(changes.length!==20||participants.some(p=>p.main_cup_no&&!ids.has(p.id)))throw new Error('Main roster differs from the approved twenty-person timetable');
if(alreadyApplied){console.log('All 20 confirmed schedules already applied; no write performed.');process.exit(0);}
const original=participants.map(p=>({id:p.id,updated_at:p.updated_at,main_cup_no:p.main_cup_no,extra_json:p.extra_json}));
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=`WITH original AS (SELECT value FROM json_each(${literal(JSON.stringify(original))})),
plan AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.extra') extra FROM json_each(${literal(JSON.stringify(changes))})),
safe AS (SELECT 1 WHERE (SELECT COUNT(*) FROM participants WHERE competition_code='KBC')=${participants.length}
 AND NOT EXISTS(SELECT 1 FROM original o LEFT JOIN participants r ON r.id=json_extract(o.value,'$.id')
 WHERE r.id IS NULL OR r.competition_code<>'KBC' OR r.updated_at IS NOT json_extract(o.value,'$.updated_at')
 OR r.extra_json IS NOT json_extract(o.value,'$.extra_json') OR r.main_cup_no IS NOT json_extract(o.value,'$.main_cup_no'))
 AND (SELECT COUNT(*) FROM scores WHERE competition_code='KBC' AND round='본선')=${Number(data[1].results[0].n)})
UPDATE participants SET extra_json=(SELECT extra FROM plan WHERE id=participants.id),updated_at=${literal(timestamp)}
WHERE competition_code='KBC' AND id IN(SELECT id FROM plan) AND EXISTS(SELECT 1 FROM safe);`;
const out=path.resolve('tmp/kbc-live-timetable-20261102');fs.mkdirSync(out,{recursive:true});
const sqlFile=path.join(out,'apply-'+Date.now()+'.sql');fs.writeFileSync(sqlFile,sql);
const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--file',sqlFile,'--json'],{encoding:'utf8',maxBuffer:16*1024*1024});
// Wrangler --file may prepend upload progress even with --json. Parse only the
// final result array, then independently re-read the saved schedule counts.
const json=output.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/);
if(!json)throw new Error('Read current schedules before retrying: write response format was not recognized');
const result=JSON.parse(json[1]);
if(result.some(r=>!r.success))throw new Error('Write not confirmed; inspect current schedules before retrying');
const checked=query("SELECT COUNT(*) n FROM participants WHERE competition_code='KBC' AND extra_json LIKE '%2026-11-12%'; SELECT COUNT(*) n FROM participants WHERE competition_code='KBC' AND extra_json LIKE '%2026-11-13%';");
if(checked.some(r=>!r.success||r.results[0].n!==10))throw new Error('Schedule count mismatch; check before retry');
console.log('Confirmed timetable applied: November 12 = 10; November 13 = 10. Only KBC participant extra_json and updated_at were changed.');
