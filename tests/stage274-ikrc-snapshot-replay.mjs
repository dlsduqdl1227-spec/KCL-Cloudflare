import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const file=process.argv[2];if(!file)throw new Error('Pass a private local read-only production snapshot');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const oldSource=execFileSync('git',['show','HEAD:functions/api/rpc.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
const old=await createRpcFixture({source:oldSource}),next=await createRpcFixture();
try {
 for(const api of [old,next])for(const [table,rows]of [['participants',data.participants],['operators',data.operators],['scores',data.scores],['competitions',data.config],['sessions',data.seed]])for(const row of rows){const cols=Object.keys(row);api.db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...Object.values(row));}
 for(const api of [old,next])api.db.prepare("INSERT INTO operators(account_type,name,phone,access,role,affiliation,team_group,effective_date,created_at,updated_at) VALUES('ADMIN','검수 QA','01099990000','ALL','관리자','','','','qa','qa')").run();
 const preOld=await old.rpc('getRanking','IKRC',old.actor,'예선'),preNew=await next.rpc('getRanking','IKRC',next.actor,'예선');
 const digest=r=>r.ranking.map(({rank,unit,score,avgScore,rankingScore,confirmedJudgeCount})=>({rank,unit,score,avgScore,rankingScore,confirmedJudgeCount}));
 assert.deepEqual(digest(preNew),digest(preOld),'existing preliminary ranks and all displayed scores remain identical');
 const roster=await next.rpc('getIkrcSeedToCupConsole',next.actor);assert.equal(roster.finalists.length,12);
 const finals=await next.rpc('getRanking','IKRC',next.actor,'결선');
 for(const rank of finals.ranking){assert.equal(rank.rankingScore,Math.round((rank.roastingScore+rank.seedBonus)*1000)/1000);assert.ok(rank.playerNameSummary);}
 assert.equal(finals.ranking.find(r=>r.unit==='A-1').seedBonus,3,'existing participant:A-1 saved bonus resolves to its registered final entrant');
 assert.equal(finals.ranking.find(r=>r.unit==='A-2').seedBonus,1);
 console.log(JSON.stringify({replayed:true,unchangedPreliminaryRankedPlayers:preNew.ranking.length,seedFinalists:roster.finalists.length,finalScores:finals.ranking.length,existingSeedResultsLinked:2}));
}finally{old.close();next.close();}
