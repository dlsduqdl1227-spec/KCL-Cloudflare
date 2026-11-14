import {createKtccHiddenFixture} from './ktcc-hidden-fixture.mjs';
export async function createKtccStageFixture(){
  const api=await createKtccHiddenFixture(),quarterId=api.find(1).id;
  const mission=await api.rpc('getKtccHiddenMission',{rowIndex:quarterId},api.actors.lead);
  await api.rpc('setKtccHiddenMission',{rowIndex:quarterId,revision:mission.revision,result:'correct'},api.actors.lead);
  await api.rpc('submitScores',api.payload(1,'결선','4강',0));
  await api.rpc('submitScores',api.payload(1,'결선','결승',2));
  await api.rpc('submitScores',api.payload(3,'결선','',0));
  await api.rpc('submitScores',api.payload(3,'결선','기존 특별전',1));
  return Object.assign(api,{quarterId});
}
