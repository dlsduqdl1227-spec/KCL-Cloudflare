import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readMobFinalPlan} from './lib/mob-final-2026.mjs';
const apply=process.argv.includes('--apply'),source='C:/Users/user/Desktop/2026 MOB 결선 타임테이블 수정.xlsx';
const python='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const sheets=JSON.parse(execFileSync(python,['-X','utf8','maintenance/read-mob-final-xlsx.py',source],{encoding:'utf8'}));
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function run(sql){
 const args=['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote'];
 if(sql.length>6000){const dir=path.resolve('tmp/mob-final-sql');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,crypto.randomUUID()+'.sql');fs.writeFileSync(file,sql);args.push('--file',file);}else args.push('--command',sql);
 args.push('--json');
 const raw=execFileSync(process.execPath,args,{encoding:'utf8',maxBuffer:96*1024*1024});
 const match=raw.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/);if(!match)throw new Error('Response not recognized; re-read before retrying');
 const result=JSON.parse(match[1]);if(result.some(r=>!r.success))throw new Error('Incomplete database response');return result.map(r=>r.results);
}
function snapshot(){const [participants,operators,scores,config]=run("SELECT * FROM participants WHERE competition_code='MOB' ORDER BY id; SELECT * FROM operators ORDER BY id; SELECT * FROM scores ORDER BY id; SELECT * FROM competitions WHERE code='MOB';");return {participants,operators,scores,config};}
const before=snapshot(),plan=readMobFinalPlan(sheets,before.participants,before.operators);
if(before.scores.some(s=>s.competition_code==='MOB'&&s.round==='결선'))throw new Error('Final scoring already started; inspect records before changing assignments');
const out=path.resolve('tmp/mob-final-timetable-'+Date.now());fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(before));
console.log(JSON.stringify({mode:apply?'apply':'audit',date:plan.date,entrants:plan.entries.map(p=>({number:p.number,name:p.name,team:p.schedule.team,performance:p.schedule.performanceTime})),judges:plan.judges.map(j=>({name:j.name,role:j.role,team:j.teamGroup,existingFinalPermission:!!j.id})),scoreCount:before.scores.length,backup:out},null,2));
if(!apply)process.exit(0);
const stamp=new Date().toISOString();
const participantPlan=plan.entries.map(entry=>{const p=before.participants.find(p=>p.id===entry.id),extra=JSON.parse(p.extra_json||'{}');extra.roundSchedules={...extra.roundSchedules,결선:{...extra.roundSchedules?.결선,...entry.schedule}};extra.mobFinalTimetableSource='2026-11-02-user-workbook';return {id:p.id,oldExtra:p.extra_json,oldUpdated:p.updated_at,number:p.final_cup_no,extra:JSON.stringify(extra)};});
// One guarded statement updates all twelve schedules; originals and every score
// are preserved. A stale source or newly started final prevents this write.
const pjson=literal(JSON.stringify(participantPlan));
run(`WITH plan AS(SELECT value FROM json_each(${pjson})), safe AS(SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM scores WHERE competition_code='MOB' AND round='결선') AND (SELECT COUNT(*) FROM plan p JOIN participants r ON r.id=json_extract(p.value,'$.id') AND r.competition_code='MOB' AND r.extra_json IS json_extract(p.value,'$.oldExtra') AND r.updated_at IS json_extract(p.value,'$.oldUpdated') AND r.final_cup_no=json_extract(p.value,'$.number'))=12)
 UPDATE participants SET extra_json=(SELECT json_extract(value,'$.extra') FROM plan WHERE json_extract(value,'$.id')=participants.id),updated_at=${literal(stamp)} WHERE competition_code='MOB' AND id IN(SELECT json_extract(value,'$.id') FROM plan) AND EXISTS(SELECT 1 FROM safe);`);
const now=snapshot();
for(const entry of participantPlan){if(now.participants.find(p=>p.id===entry.id)?.extra_json!==entry.extra)throw new Error('Schedule write not confirmed; do not change judges');}
const expectedOperators=literal(JSON.stringify(before.operators));
// The confirmed final day has no pre-existing permissions on this import. Avoid
// overwriting an unexpected final-day record; subsequent runs can verify as no-op.
const missing=plan.judges.filter(j=>!j.id);
for(const j of plan.judges.filter(j=>j.id)){const old=before.operators.find(o=>o.id===j.id);if(old.role!==j.role||old.team_group!==j.teamGroup)throw new Error('Existing final-day role differs; review before overwriting: '+j.name);}
if(missing.length){
 const data=literal(JSON.stringify(missing));
 run(`WITH original AS(SELECT value FROM json_each(${expectedOperators})),safe AS(SELECT 1 WHERE (SELECT COUNT(*) FROM operators)=(SELECT COUNT(*) FROM original) AND NOT EXISTS(SELECT 1 FROM original s LEFT JOIN operators r ON r.id=json_extract(s.value,'$.id') WHERE r.id IS NULL OR r.updated_at IS NOT json_extract(s.value,'$.updated_at') OR r.access IS NOT json_extract(s.value,'$.access') OR r.role IS NOT json_extract(s.value,'$.role') OR r.team_group IS NOT json_extract(s.value,'$.team_group') OR r.effective_date IS NOT json_extract(s.value,'$.effective_date')) AND NOT EXISTS(SELECT 1 FROM scores WHERE competition_code='MOB' AND round='결선'))
 INSERT INTO operators(account_type,name,affiliation,phone,access,team_group,role,effective_date,created_at,updated_at)
 SELECT 'JUDGE',json_extract(value,'$.name'),json_extract(value,'$.affiliation'),json_extract(value,'$.phone'),'MOB',json_extract(value,'$.teamGroup'),json_extract(value,'$.role'),json_extract(value,'$.effectiveDate'),${literal(stamp)},${literal(stamp)} FROM json_each(${data}) WHERE EXISTS(SELECT 1 FROM safe);`);
}
const after=snapshot();fs.writeFileSync(path.join(out,'after.json'),JSON.stringify(after));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(hash(before.scores)!==hash(after.scores))throw new Error('Scores changed during import; inspect snapshots');
if(hash(before.config)!==hash(after.config))throw new Error('Operating configuration changed during import');
for(const old of before.operators){if(JSON.stringify(after.operators.find(o=>o.id===old.id))!==JSON.stringify(old))throw new Error('Existing operator modified: '+old.id);}
for(const p of after.participants){const old=before.participants.find(r=>r.id===p.id);for(const key of ['name','affiliation','phone','unique_no','prelim_cup_no','main_cup_no','final_cup_no'])if(p[key]!==old[key])throw new Error('Protected identity changed');if(!plan.entries.some(e=>e.id===p.id)&&JSON.stringify(p)!==JSON.stringify(old))throw new Error('Non-finalist modified');const extra=JSON.parse(p.extra_json||'{}'),oldExtra=JSON.parse(old.extra_json||'{}');for(const key of Object.keys(oldExtra).filter(k=>!['roundSchedules','mobFinalTimetableSource'].includes(k)))if(JSON.stringify(extra[key])!==JSON.stringify(oldExtra[key]))throw new Error('Preliminary metadata modified');}
for(const j of plan.judges){const matches=after.operators.filter(o=>o.name===j.name&&o.phone===j.phone&&o.access==='MOB'&&o.effective_date===plan.date);if(matches.length!==1||matches[0].role!==j.role||matches[0].team_group!==j.teamGroup)throw new Error('Final judge assignment not confirmed: '+j.name);}
console.log(JSON.stringify({verified:true,finalists:12,judges:12,previousScoresPreserved:after.scores.length,previousOperatorRowsPreserved:before.operators.length,scoreDigest:hash(after.scores),backup:out}));
