import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const api=await createRpcFixture();
try {
  for(const code of ['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC']) {
    await api.rpc('updateCompetitionAdminSettings',{code,currentRound:'예선',isActive:true,debriefing:true},api.actor);
    const before=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code);
    const partial=code==='KCAC'?{kcacFinalPanelMode:'split-four-heads-160'}:{settingsRegressionCheck:true};
    await api.rpc('updateCompetitionAdminSettings',{code,optionSettings:partial},api.actor);
    const after=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code);
    assert.equal(after.is_active,1,code+' must stay open');
    assert.equal(after.debriefing,1,code+' must keep public state');
    assert.equal(after.current_round,before.current_round);
    assert.equal(after.name,before.name);
    assert.deepEqual(JSON.parse(after.option_settings),{...JSON.parse(before.option_settings),...partial});
    // Explicit false still closes either switch independently.
    await api.rpc('updateCompetitionAdminSettings',{code,isActive:false},api.actor);
    const closed=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code);
    assert.equal(closed.is_active,0);assert.equal(closed.debriefing,1);
    await api.rpc('updateCompetitionAdminSettings',{code,debriefing:false},api.actor);
    const hidden=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code);
    assert.equal(hidden.is_active,0);assert.equal(hidden.debriefing,0);
  }
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,0);
  console.log('Stage262: all seven competitions preserve omitted open/debrief settings; explicit false remains supported.');
} finally { api.close(); }
