import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const apply=process.argv.includes('--apply');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function run(sql){
 const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','kcl-cloudflare','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:96*1024*1024});
 const data=JSON.parse(raw.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/)[1]);
 if(data.some(r=>!r.success))throw new Error('Unconfirmed database operation; re-read before retrying');
 return data.map(r=>r.results);
}
function snapshot(){const [operators,participants,scores,config]=run('SELECT * FROM operators ORDER BY id; SELECT * FROM participants ORDER BY id; SELECT * FROM scores ORDER BY id; SELECT * FROM competitions ORDER BY code;');return {operators,participants,scores,config};}
const before=snapshot();
const targets=before.operators.filter(row=>row.effective_date&&row.access.split(',').some(code=>['MOB','KBC'].includes(code)));
for(const row of targets){
 if(row.access.split(',').some(code=>!['MOB','KBC'].includes(code)))throw new Error('Shared access outside MOB/KBC; needs competition-specific split, no write');
 if(before.operators.some(other=>other.id!==row.id&&other.name===row.name&&other.phone===row.phone&&!other.effective_date&&other.access.split(',').some(code=>row.access.split(',').includes(code))))throw new Error('Conflicting permanent permission; review first, no write');
}
const dir=path.resolve('tmp/permanent-mob-kbc-'+Date.now());fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before));
console.log(JSON.stringify({mode:apply?'apply':'audit',backup:dir,changes:targets.map(({id,name,access,role,team_group,effective_date})=>({id,name,access,role,team:team_group,from:effective_date,to:'상시'}))},null,2));
if(!apply||!targets.length)process.exit(0);
const plan=literal(JSON.stringify(targets)),stamp=literal(new Date().toISOString());
const guard=Object.keys(targets[0]).map(key=>`r.${key} IS json_extract(p.value,'$.${key}')`).join(' AND ');
run(`WITH plan AS(SELECT value FROM json_each(${plan})),safe AS(SELECT 1 WHERE (SELECT COUNT(*) FROM plan p JOIN operators r ON ${guard})=${targets.length}) UPDATE operators SET effective_date='',updated_at=${stamp} WHERE id IN(SELECT json_extract(value,'$.id') FROM plan) AND EXISTS(SELECT 1 FROM safe);`);
const after=snapshot();fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify(after));
for(const old of before.operators){const current=after.operators.find(row=>row.id===old.id);if(!targets.some(row=>row.id===old.id)){assert.deepEqual(current,old);continue;}assert.equal(current.effective_date,'');for(const key of Object.keys(old).filter(key=>!['effective_date','updated_at'].includes(key)))assert.equal(current[key],old[key]);}
assert.equal(before.operators.length,after.operators.length);
for(const key of ['participants','scores','config'])assert.deepEqual(after[key],before[key],key+' must be preserved');
console.log(JSON.stringify({verified:true,permanentPermissions:targets.length,allScoresAndCommentsPreserved:after.scores.length,participantsAndSchedulesPreserved:true,rolesTeamsAndOtherCompetitionAccessPreserved:true,backup:dir}));
