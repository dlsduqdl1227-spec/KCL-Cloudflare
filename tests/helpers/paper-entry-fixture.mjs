import {createRpcFixture} from './rpc-fixture.mjs';
import {seedRoundRankings,competitionCodes} from './round-ranking-fixture.mjs';
export async function createPaperEntryFixture(options={}){
 const api=await createRpcFixture(options);await seedRoundRankings(api);const leads={},targets={};
 for(const [n,code]of competitionCodes.entries()){
  const name='수기 팀장 '+code,phone='0103300'+String(n).padStart(4,'0');
  await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name,phone,access:code,role:'대회팀장'},api.actor);leads[code]=await api.rpc('judgeLogin',name,phone);
  targets[code]=[];
  for(let i=0;i<2;i++){const judgeName='수기 심사 '+code+' '+i,judgePhone='010440'+String(n).padStart(3,'0')+i+'0';
   await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:judgeName,phone:judgePhone,access:code,role:code==='KCAC'?'헤드 심사위원':'센서리 심사위원',teamGroup:'A조'},api.actor);
   targets[code].push(api.db.prepare('SELECT * FROM operators WHERE name=? AND phone=?').get(judgeName,judgePhone));
  }
 }
 const raw=async(action,...args)=>(await api.handle({action,args})).json();
 const create=async(code,round='결선',ids=targets[code].map(row=>Number(row.id)),actor=leads[code])=>api.rpc('createPaperEntrySessions',{competitionCode:code,round,operatorIds:ids,paperConfirmed:true,day:'1'},actor);
 function payload(code,token,round='결선'){
  const saved=api.db.prepare('SELECT payload_json FROM scores WHERE competition_code=? AND round=? ORDER BY id LIMIT 1').get(code,round);
  const data=JSON.parse(saved.payload_json);data.judgeToken=token;data.judgeName='FORGED NAME';data.judgeRole='관리자';data.clientSubmissionId='paper-'+code+'-'+round+'-'+crypto.randomUUID();return data;
 }
 return Object.assign(api,{leads,targets,raw,create,payload,codes:competitionCodes});
}
