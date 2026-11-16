import assert from 'node:assert/strict';
import {createRpcFixture} from './rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './ikrc-final-fixture.mjs';

export async function createIkrcPanelDisplayFixture() {
  const api=await createRpcFixture();
  try {
    const {judges,stations,participants}=await seedIkrcFinal(api);
    const ids=judges.map(j=>j.operatorRows.find(row=>row.access==='IKRC').rowIndex);
    api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)')
      .run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
    for(let i=0;i<judges.length;i++) {
      const res=await api.rpc('submitScores',ikrcFinalSubmission(judges[i],stations[0],i?5.8+i*.2:10));
      assert.equal(res.success,true);
    }
    const seed=await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id),expectedSavedAt:''},2,'QA 결선',api.actor);
    assert.equal(seed.success,true);
    const snapshot=()=>JSON.stringify({
      scores:api.db.prepare('SELECT * FROM scores ORDER BY id').all(),
      participants:api.db.prepare('SELECT * FROM participants ORDER BY id').all(),
      settings:api.db.prepare('SELECT * FROM system_settings ORDER BY setting_key').all()
    });
    return {...api,judges,stations,snapshot};
  } catch(error) {api.close();throw error;}
}
