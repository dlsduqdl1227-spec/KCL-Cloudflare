export function readMobFinalPlan(sheets,participants,operators){
 const [time,judges]=sheets,date='2026-11-11',entries=[],panel=new Map(),names=new Set();
 if(!time?.A1?.includes('11월 11일')||judges?.H7!=='센서리 1'||judges?.K7!=='센서리 헤드'||judges?.M7!=='테크니컬 헤드')throw new Error('Unexpected source layout');
 const roles={H:'센서리 심사위원',I:'센서리 심사위원',J:'센서리 심사위원',K:'센서리 헤드 심사위원',L:'테크니컬 심사위원',M:'테크니컬 헤드 심사위원'};
 const normalize=value=>String(value||'').replace(/\s/g,'');
 const tableRows=[4,10,16,24,30,36];
 for(let index=0;index<12;index++){
  const row=index+8,order=index+1,group=order%2?'A조':'B조',station=order%2?'1':'2';
  const name=judges['G'+row],matches=participants.filter(p=>normalize(p.name)===normalize(name));
  if(matches.length!==1||names.has(name))throw new Error('Participant identity is missing/ambiguous: '+name);
  names.add(name);const p=matches[0];
  const tr=tableRows[Math.floor(index/2)],right=index%2;
  const expected={order:time[(right?'G':'A')+tr],name:time[(right?'J':'D')+tr],station:time[(right?'K':'E')+tr],tasting:time[(right?'I':'C')+tr],waiting:time[(right?'I':'C')+(tr+1)],prep:time[(right?'I':'C')+(tr+2)],performance:time[(right?'I':'C')+(tr+3)]};
  if(Number(judges['A'+row])!==order||judges['B'+row]!==group||judges['C'+row]!==station||Number(expected.order)!==order||expected.name!==name||expected.station!==station||expected.waiting!==judges['D'+row]||expected.prep!==judges['E'+row]||expected.performance!==judges['F'+row])throw new Error('Two source sheets disagree at '+order);
  if(String(p.final_cup_no)!==String(order))throw new Error('Existing final number differs; do not renumber existing records: '+name);
  entries.push({id:p.id,name,number:String(order),schedule:{date,day:'1',order,team:group,station,waitingTime:expected.waiting,preparationTime:expected.prep,performanceTime:expected.performance,tastingRoomTime:expected.tasting}});
  for(const [column,role]of Object.entries(roles)){
   const judgeName=judges[column+row],key=normalize(judgeName);
   if(!key)throw new Error('Judge missing at '+column+row);
   const prior=panel.get(key);
   if(prior&&(prior.teamGroup!==group||prior.role!==role))throw new Error('Judge assigned conflicting roles/teams: '+judgeName);
   if(!prior){
    const candidates=operators.filter(o=>normalize(o.name)===key);
    const phones=new Set(candidates.map(o=>String(o.phone||'').replace(/\D/g,'')).filter(Boolean));
    if(phones.size!==1)throw new Error('Judge contact is missing/ambiguous: '+judgeName);
    const phone=[...phones][0],source=candidates.filter(o=>String(o.phone||'').replace(/\D/g,'')===phone).sort((a,b)=>(b.access==='MOB')-(a.access==='MOB')||b.id-a.id)[0];
    const existing=candidates.filter(o=>o.access==='MOB'&&o.effective_date===date);
    if(existing.length>1)throw new Error('Duplicate final-day permission: '+judgeName);
    panel.set(key,{name:source.name,phone,affiliation:source.affiliation||'',access:'MOB',accountType:'JUDGE',role,teamGroup:group,effectiveDate:date,id:existing[0]?.id||0});
   }
  }
 }
 if(entries.length!==12||panel.size!==12)throw new Error('Expected 12 entrants and 12 distinct judges');
 return {date,entries,judges:[...panel.values()]};
}
