import {createRpcFixture} from './rpc-fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';

export async function createMobCalibrationFixture() {
  const api = await createRpcFixture();
  await api.rpc('updateCompetitionAdminSettings', {code:'MOB', currentRound:'결선'}, api.actor);
  const actors = {};
  const accounts = [
    ['sensoryHead', '센서리 헤드 QA', '01070002871', '센서리 헤드 심사위원', 'MOB', 'A조'],
    ['technicalHead', '테크니컬 헤드 QA', '01070002872', '테크니컬 헤드 심사위원', 'MOB', 'B조'],
    ['judge', '일반 심사 QA', '01070002873', '센서리 심사위원', 'MOB', 'A조'],
    ['otherHead', '다른 대회 헤드 QA', '01070002874', '센서리 헤드 심사위원', 'KCR', 'A조']
  ];
  for (const [key, name, phone, role, access, teamGroup] of accounts) {
    await api.rpc('upsertOperatorAccount', {name, phone, role, access, teamGroup, accountType:'JUDGE'}, api.actor);
    actors[key] = await api.rpc('judgeLogin', name, phone);
  }
  // A person can be a team lead elsewhere and still be a MOB head.
  await api.rpc('upsertOperatorAccount', {name:accounts[0][1], phone:accounts[0][2], role:'대회팀장', access:'MOC', accountType:'TEAMLEAD'}, api.actor);
  actors.multiroleHead = await api.rpc('judgeLogin', accounts[0][1], accounts[0][2]);
  const insert = api.db.prepare('INSERT INTO scores (competition_code,round,judge_name,team,role,mode,unit,total_score,review_status,payload_json,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  function seed(name, role, mode='judge', round='결선', unit='1', competition='MOB') {
    const extraFields = {'Sweetness(스윗니스)':4,'Flavor(플레이버)':4,'Balance(균형)':4,'Clean Cup(클린컵)':4,'Mouthfeel(질감)':4,'Professionalism(시연 전문성)':4,'Pre-Service Station(시연 전 작업대)':2,'Service Station(시연 중 작업대)':3,'Post-Service Station(시연 후 작업대)':4,'종합코멘트':'확인할 심사 코멘트'};
    const payload = {competitionCode:competition, round, judgeName:name, judgeRole:role, mode, rows:[{data:[unit,'브루잉'],extraFields}]};
    insert.run(competition, round, name, 'A조', role, mode, unit, 24, '미검수', JSON.stringify(payload), '2026-11-11T01:00:00.000Z');
  }
  seed('센서리 일반 QA 1','센서리 심사위원');
  seed('센서리 일반 QA 2','센서리 심사위원');
  seed('테크니컬 일반 QA','테크니컬 심사위원');
  seed(accounts[0][1],accounts[0][3],'켈리브레이션/팀별');
  seed(accounts[1][1],accounts[1][3],'켈리브레이션/팀별');
  seed('예선 심사 QA','센서리 심사위원','judge','예선','99');
  seed('다른 대회 심사 QA','센서리 심사위원','judge','결선','88','KCR');
  return {...api, actors, snapshot:()=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all())};
}

export function strictShimRpc(api) {
  const source = fs.readFileSync(new URL('../../public/assets/kcl-api-shim.js', import.meta.url),'utf8');
  const calls = [];
  let timer = 0;
  const context = {window:{}, navigator:{onLine:true}, AbortController, Proxy, console,
    setTimeout(fn,delay) { if(delay<60000)queueMicrotask(fn); return ++timer; }, clearTimeout(){},
    fetch(url, options) { const body=JSON.parse(options.body); calls.push(body.action); return api.handle(body); }
  };
  vm.runInNewContext(source,context);
  return {calls, rpc:(action,...args)=>new Promise((resolve,reject)=>context.window.google.script.run.withSuccessHandler(data=>resolve(JSON.parse(JSON.stringify(data)))).withFailureHandler(reject)[action](...args))};
}
