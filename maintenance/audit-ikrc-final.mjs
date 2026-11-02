import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const sql="SELECT * FROM participants ORDER BY id; SELECT * FROM operators ORDER BY id; SELECT * FROM scores ORDER BY id; SELECT * FROM competitions ORDER BY code; SELECT * FROM sessions WHERE kind IN ('IKRC_SEED_RESULT','IKRC_SEED_MATCH') ORDER BY token;";
const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:96*1024*1024});
const result=JSON.parse(raw.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/)[1]);
if(result.some(r=>!r.success))throw new Error('Incomplete snapshot');
const [participants,operators,scores,config,seed]=result.map(r=>r.results);
const out=path.resolve('tmp/ikrc-final-'+Date.now()+'.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({participants,operators,scores,config,seed}));
const ikrc=participants.filter(p=>p.competition_code==='IKRC');
console.log(JSON.stringify({snapshot:out,counts:[participants.length,operators.length,scores.length],round:config.find(c=>c.code==='IKRC')?.current_round,finalists:ikrc.filter(p=>p.final_cup_no||JSON.parse(p.extra_json||'{}').ikrcBlindAssignments?.결선).map(p=>({id:p.id,name:p.name,affiliation:p.affiliation,final:p.final_cup_no,blind:JSON.parse(p.extra_json||'{}').ikrcBlindAssignments?.결선})),finalScoreCount:scores.filter(s=>s.competition_code==='IKRC'&&s.round==='결선').length,seedRecordCount:seed.length},null,2));
if(process.argv.includes('--apply-affiliation')){
 const candidates=ikrc.filter(p=>p.name==='김태민'&&p.final_cup_no==='9');
 if(candidates.length!==1)throw new Error('Participant is ambiguous; no write');
 const row=candidates[0],extra=JSON.parse(row.extra_json||'{}');extra['소속']='CHOi';
 if(row.affiliation==='CHOi'&&JSON.parse(row.extra_json||'{}')['소속']==='CHOi'){console.log('Affiliation already matches. No write.');process.exit(0);}
 const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
 const update=`UPDATE participants SET affiliation='CHOi',extra_json=${literal(JSON.stringify(extra))},updated_at=${literal(new Date().toISOString())} WHERE competition_code='IKRC' AND id=${Number(row.id)} AND name='김태민' AND affiliation=${literal(row.affiliation)} AND extra_json=${literal(row.extra_json)} AND updated_at=${literal(row.updated_at)};`;
 const write=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',update,'--json'],{encoding:'utf8'});
 const result=JSON.parse(write.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/)[1]);
 if(result.some(r=>!r.success))throw new Error('Affiliation write unconfirmed. Re-read before retrying.');
 const verification=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',`SELECT affiliation,extra_json FROM participants WHERE competition_code='IKRC' AND id=${Number(row.id)}`,'--json'],{encoding:'utf8'});
 const confirmed=JSON.parse(verification.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/)[1])[0].results[0];
 if(confirmed?.affiliation!=='CHOi'||confirmed?.extra_json!==JSON.stringify(extra))throw new Error('Affiliation guard did not apply; re-read before retrying.');
 console.log(JSON.stringify({updatedParticipantId:row.id,name:row.name,affiliation:'CHOi',backup:out}));
}
