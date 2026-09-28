// One-time, explicitly applied operational plan. Not loaded by the application:
// opening or saving the admin page must never overwrite later manual ranges.
export function buildKcrNineCupPlan(options, currentRound='예선') {
  const result=structuredClone(options);
  const raw=result.kcrStations;
  if(!raw?.byRound?.예선?.length)throw Error('Expected existing KCR preliminary station settings');
  const official=raw.byRound.예선.filter(s=>s.useForCompetition!==false);
  if(!official.length || official.some(s=>s.process!=='Blending'))throw Error('Review KCR process settings before regrouping');
  const calibration=raw.byRound.예선.filter(s=>s.useForCompetition===false && s.useForCalibration!==false);
  const prelim=[];
  for(const day of [1,2]) {
    const pool=official.filter(s=>s.prelimDay===day);
    if(pool.length<13)throw Error('Expected at least 13 reusable stations per preliminary day');
    for(let i=0;i<13;i++) {
      const start=(day-1)*113+i*9+1,end=Math.min(day*113,start+8);
      prelim.push({...pool[i],start,end,prelimDay:day,useForCalibration:false,useForCompetition:true,numberMode:'participant'});
    }
  }
  // Keep calibration's stable identity; place it after official stations so
  // competition station 1 represents entrants 1–9, rather than station 2.
  prelim.push(...calibration.map(s=>({...s,start:1,end:9})));
  prelim.forEach((s,i)=>s.label=`스테이션 ${i+1}`);
  const oldFinal=raw.byRound.결선 || [];
  const final=Array.from({length:5},(_,i)=>({
    ...(oldFinal[i] || oldFinal.at(-1) || {}),
    id:oldFinal[i]?.id || `kcr-final-nine-${i+1}`,
    label:`스테이션 ${i+1}`,prefix:oldFinal[i]?.prefix || `F${i+1}`,
    start:i*9+1,end:Math.min(40,(i+1)*9),process:'Blending',prelimDay:null,
    useForCalibration:oldFinal[i]?.useForCalibration!==false,
    useForCompetition:true,numberMode:'participant'
  }));
  raw.byRound={...raw.byRound,예선:prelim,결선:final};
  raw.stations=raw.byRound[currentRound];
  if(!raw.stations)throw Error('Unknown active KCR round');
  for(const list of [prelim,final]) {
    if(new Set(list.map(s=>s.id)).size!==list.length)throw Error('Duplicate station identity');
    if(new Set(list.map(s=>s.prefix)).size!==list.length)throw Error('Duplicate station prefix');
  }
  return result;
}
