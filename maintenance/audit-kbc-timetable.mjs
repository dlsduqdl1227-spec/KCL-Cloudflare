import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Read-only production evidence. Scores and participant contacts stay in the
// ignored local backup; stdout contains counts and digests, not personal data.
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Use before or after');
const outDir=path.resolve('tmp/kbc-live-timetable-20261102');
fs.mkdirSync(outDir,{recursive:true});
const sql="SELECT * FROM participants WHERE competition_code='KBC' ORDER BY id; SELECT * FROM scores WHERE competition_code='KBC' ORDER BY id; SELECT competition_code,round,COUNT(*) n,SUM(total_score) total FROM scores GROUP BY competition_code,round ORDER BY competition_code,round; SELECT code,current_round,is_active,debriefing,option_settings FROM competitions WHERE code='KBC';";
const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:64*1024*1024});
const result=JSON.parse(raw);
if(result.length!==4||result.some(r=>!r.success))throw new Error('Incomplete database read');
const snapshot={participants:result[0].results,scores:result[1].results,scoreGroups:result[2].results,config:result[3].results};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=path.join(outDir,phase+'.json');
if(fs.existsSync(file))throw new Error('Preserve existing backup: '+file);
fs.writeFileSync(file,JSON.stringify(snapshot,null,2));
const scheduled=snapshot.participants.filter(p=>p.main_cup_no).map(p=>({id:p.id,name:p.name,main:p.main_cup_no,schedule:JSON.parse(p.extra_json||'{}').roundSchedules?.본선}));
if(phase==='after'){
  const before=JSON.parse(fs.readFileSync(path.join(outDir,'before.json'),'utf8'));
  if(hash(snapshot.scores)!==hash(before.scores))throw new Error('KBC scores changed: inspect before proceeding');
  if(hash(snapshot.scoreGroups)!==hash(before.scoreGroups))throw new Error('Competition score aggregates changed: inspect before proceeding');
  for(const p of snapshot.participants){
    const old=before.participants.find(r=>r.id===p.id);
    for(const field of ['name','phone','affiliation','unique_no','prelim_cup_no','final_cup_no'])if(!old||p[field]!==old[field])throw new Error('Protected participant field changed: '+p.id+' '+field);
  }
}
console.log(JSON.stringify({phase,participantCount:snapshot.participants.length,mainCount:scheduled.length,
  day1:scheduled.filter(p=>p.schedule?.day==='1').length,day2:scheduled.filter(p=>p.schedule?.day==='2').length,
  kbcScoreCount:snapshot.scores.length,kbcScoreDigest:hash(snapshot.scores),scoreGroupsDigest:hash(snapshot.scoreGroups),
  scoreAndIdentityPreservation:phase==='after'?'verified':'baseline saved',backup:file},null,2));
