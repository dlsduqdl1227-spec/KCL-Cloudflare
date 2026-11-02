import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {readMobFinalPlan} from '../maintenance/lib/mob-final-2026.mjs';
const source=fs.readFileSync('functions/api/rpc.js','utf8').replace('function koreaDateKey_(date = new Date()) {',"function koreaDateKey_(date = new Date()) { return '2026-11-11';");
const api=await createRpcFixture({source});
try{
 const names=['류서윤','최지연','장향화','김현석','조세윤','한선미','한상우','박강수','신준호','표경화','고재광','김민제'];
 const sensoryA=['최율','최원석','박민지','한지호','이서경','정재근'],sensoryB=['박병훈','박서희','송은경','류승현','이승호','김도윤'];
 const roles=['센서리 심사위원','센서리 심사위원','센서리 심사위원','센서리 헤드 심사위원','테크니컬 심사위원','테크니컬 헤드 심사위원'];
 const starts=['10:00','10:55','11:20','11:45','12:10','12:35','14:00','14:25','14:50','15:15','15:40','16:05'];
 const offset=(s,n)=>{const [h,m]=s.split(':').map(Number),t=h*60+m+n;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
 const range=(s,a,b)=>offset(s,a)+'~'+offset(s,b),time={A1:'2026 MOB 본선 11월 11일'},judges={H7:'센서리 1',K7:'센서리 헤드',M7:'테크니컬 헤드'};
 for(let i=0;i<12;i++){
  await api.rpc('upsertParticipant',{competitionCode:'MOB',name:names[i],uniqueNo:'원본'+i,prelimCupNo:String(100+i),finalCupNo:String(i+1),extra:{'대회일':'2026-08-06','심사조':i%2?'A조':'B조',memo:'예선 보존'}},api.actor);
  const row=i+8,tr=[4,10,16,24,30,36][Math.floor(i/2)],right=i%2;
  Object.assign(judges,{['A'+row]:String(i+1),['B'+row]:i%2?'B조':'A조',['C'+row]:i%2?'2':'1',['D'+row]:range(starts[i],0,5),['E'+row]:range(starts[i],5,15),['F'+row]:range(starts[i],15,30),['G'+row]:names[i]});
  for(let j=0;j<6;j++)judges['HIJKLM'[j]+row]=(i%2?sensoryB:sensoryA)[j];
  Object.assign(time,{[(right?'G':'A')+tr]:String(i+1),[(right?'J':'D')+tr]:names[i],[(right?'K':'E')+tr]:i%2?'2':'1',[(right?'I':'C')+tr]:range(starts[i],-15,0),[(right?'I':'C')+(tr+1)]:judges['D'+row],[(right?'I':'C')+(tr+2)]:judges['E'+row],[(right?'I':'C')+(tr+3)]:judges['F'+row]});
 }
 const all=sensoryA.concat(sensoryB);
 for(let i=0;i<all.length;i++)await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:all[i],phone:'0108000'+String(i).padStart(4,'0'),access:'MOB',role:'센서리 심사위원',teamGroup:'예선조',effectiveDate:'2026-08-06'},api.actor);
 await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:'한지호',phone:'01080000003',access:'MOC',role:'대회팀장',teamGroup:'',effectiveDate:''},api.actor);
 let participants=api.db.prepare("SELECT * FROM participants WHERE competition_code='MOB'").all(),operators=api.db.prepare('SELECT * FROM operators').all();
 const plan=readMobFinalPlan([time,judges],participants,operators);
 assert.equal(plan.entries.length,12);assert.equal(plan.judges.length,12);
 assert.deepEqual(plan.judges.filter(j=>j.teamGroup==='A조').map(j=>j.name),sensoryA);
 assert.deepEqual(plan.judges.filter(j=>j.teamGroup==='B조').map(j=>j.role),roles);
 const broken=structuredClone(judges);broken.H10='다른 심사위원';assert.throws(()=>readMobFinalPlan([time,broken],participants,operators));
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
 for(const entry of plan.entries){const p=participants.find(p=>p.id===entry.id),extra=JSON.parse(p.extra_json);extra.roundSchedules={결선:entry.schedule};await api.rpc('upsertParticipant',{rowIndex:p.id,competitionCode:'MOB',name:p.name,uniqueNo:p.unique_no,prelimCupNo:p.prelim_cup_no,finalCupNo:p.final_cup_no,extra},api.actor);}
 for(const judge of plan.judges)await api.rpc('upsertOperatorAccount',judge,api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'MOB',currentRound:'결선'},api.actor);
 for(const judge of plan.judges){
  const actor=await api.rpc('judgeLogin',judge.name,judge.phone,'0806');
  assert.equal(actor.roleMap.MOB,judge.role);assert.equal(actor.teamMap.MOB,judge.teamGroup);
  const result=await api.rpc('getParticipantAssignments','MOB',actor);
  assert.deepEqual(result.assignments.map(a=>Number(a.number)),judge.teamGroup==='A조'?[1,3,5,7,9,11]:[2,4,6,8,10,12]);
  assert.ok(result.assignments.every(a=>a.competitionDate==='2026-11-11'&&a.scheduleTeam===judge.teamGroup));
  if(judge.name==='한지호')assert.equal(actor.accountTypeMap.MOC,'TEAMLEAD');
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),before);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM operators WHERE effective_date='2026-08-06'").get().n,12);
 console.log('Stage270: two-sheet timetable reconciliation, twelve identity matches, final-day roles and A/B six-entrant lists, cross-competition team lead preserved and preliminary permissions/scores unchanged passed.');
}finally{api.close();}
