import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

const source = fs.readFileSync('functions/api/rpc.js', 'utf8');
const isolatedSource = source.slice(source.indexOf('function _coffeeQuality_'), source.indexOf('function generateKbcCommentLegacy_'));
const pure = {
  safeStr: value => value == null ? '' : String(value),
  _tags: (values, max) => Array.isArray(values) ? values.slice(0, max) : [],
  _cleanTagText_: value => String(value).split('>').at(-1).trim(),
  _shortObservation_: (value, limit) => String(value).replace(/\s+/g, ' ').trim().slice(0, limit),
  _topicParticle_: () => '는',
  _conciseCommentOptions_: lines => ({success:true, comments:[lines.filter(Boolean).join('\n')]})
};
vm.createContext(pure);
vm.runInContext(isolatedSource, pure);

// A high score is a positive evaluation, not evidence of clarity, aroma,
// smooth texture, sweetness intensity, balance or a long finish.
const scoresOnly = pure.generateCuppingComment({
  flavor:5, acidity:5, sweetness:5, mouthfeel:5, aftertaste:5, overall:5
}).comments[0];
assert.doesNotMatch(scoresOnly, /선명|깔끔|매끄|균형|과일|꽃|초콜릿|긴 여운|강하게|강도로|온도/);
assert.match(scoresOnly, /완성도는 매우 높은 수준/);
assert.equal(pure._coffeeIntensity_(undefined), '');
assert.equal(pure._coffeeIntensity_(0), '');
assert.equal(pure._coffeeIntensity_(9), '');
assert.equal(pure._coffeeIntensity_(4.5), '');
assert.equal(pure._coffeeQuality_(null, 5), '');
assert.equal(pure._coffeeQuality_('', 5), '');

const api = await createRpcFixture();
try {
  // Keep real stored evidence in the fixture and verify the complete database,
  // not merely the caller's JSON, remains byte-for-byte unchanged.
  api.db.exec('CREATE TABLE narrative_preservation (id TEXT PRIMARY KEY, evidence TEXT)');
  const savedEvidence = JSON.stringify({
    score:72.2, tags:['오렌지', '거친'], comment:'심사위원이 직접 작성한 원문', round:'예선'
  });
  api.db.prepare('INSERT INTO narrative_preservation VALUES (?, ?)').run('saved-preliminary', savedEvidence);
  const beforeScores = JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const payload = {
    flavor:3.8, flavorIntensity:5, acidity:3.2, acidityIntensity:5,
    sweetness:3.6, sweetnessIntensity:3, mouthfeel:3.4, mouthfeelIntensity:4,
    aftertaste:3.2, aftertastePersistence:6, overall:3.6,
    tags:{
      flavor:['과일 > 오렌지', '견과 > 아몬드', '과일 > 오렌지'],
      acidity:['밝은'], sweetness:['캐러멜'],
      mouthfeel:['매끄러운', '거친'], aftertaste:['깔끔한']
    },
    attributeComments:'플레이버: 오렌지 껍질 향이 남음 / 산미: 식으면서 산미가 부드러워짐 / 마우스필: 끝에 약한 건조감'
  };
  const original = JSON.stringify(payload);
  const result = await api.rpc('generateCuppingComment', payload);
  assert.equal(JSON.stringify(payload), original);
  assert.equal(result.comments.length, 2);
  for (const text of result.comments) {
    assert.equal(text.split('\n').length, 5);
    assert.ok(text.length < 530, text.length);
    for (const observed of ['오렌지', '아몬드', '캐러멜', '매끄러운', '거친', '깔끔한', '끝에 약한 건조감', '식으면서 산미가 부드러워짐']) {
      assert.ok(text.includes(observed), observed);
    }
    assert.match(text, /산미가 단맛보다 더 강하게/);
    assert.match(text, /지속감은 긴 편/);
    assert.doesNotMatch(text, /오렌지·아몬드·오렌지|균형 잡|개선|훈련|연습|해야|총점|평균.*점|\d+(?:\.\d+)?점/);
    assert.doesNotMatch(text, /선명한 인상|안정적인 인상|선택된 감각 단서|점수와 표현/);
  }
  const low = await api.rpc('generateCuppingComment', {
    flavor:1.8, flavorIntensity:6, acidity:1.5, acidityIntensity:6,
    sweetness:1.8, sweetnessIntensity:2, mouthfeel:1.6, mouthfeelIntensity:6,
    aftertaste:1.6, aftertastePersistence:2, overall:1.8,
    tags:{flavor:['종이 같은'], acidity:['Harsh'], sweetness:['플랫'], mouthfeel:['거친'], aftertaste:['드라이']}
  });
  assert.match(low.comments[0], /종이 같은.*강하게/);
  assert.match(low.comments[0], /완성도는 제한적인/);
  assert.doesNotMatch(low.comments[0], /선명|조화|균형 잡|높은 완성도/);
  assert.match(low.comments[0], /지속감은 짧은 편/);
  const noPersistence = await api.rpc('generateCuppingComment', {...payload, aftertastePersistence:undefined, attributeComments:''});
  assert.doesNotMatch(noPersistence.comments[0], /지속감|긴 편|짧은 편/);

  const ikrcPayload = {
    scores:{flavor:7.4, cleanCup:6.6, sweetness:7, acidity:5.4, mouthfeel:6.8},
    intensities:{flavor:6, cleanCup:4, sweetness:5, acidity:4, mouthfeel:5},
    tags:{
      flavor:['견과 > 아몬드', '베리 > 블루베리'], cleanCup:['정돈된'],
      sweetness:['캐러멜'], acidity:['밝은'], mouthfeel:['시러피']
    }
  };
  const ikrcOriginal = JSON.stringify(ikrcPayload);
  const ikrc = await api.rpc('generateIkrcComment', ikrcPayload);
  assert.equal(JSON.stringify(ikrcPayload), ikrcOriginal);
  for (const text of ikrc.comments) {
    assert.equal(text.split('\n').length, 5);
    assert.ok(text.length < 350, text.length);
    for (const attr of ['플레이버', '클린컵', '단맛', '산미', '마우스필']) assert.ok(text.includes(attr), attr);
    assert.match(text, /단맛이 산미보다 더 강하게/);
    assert.match(text, /플레이버는 상대적으로 높게, 산미는 상대적으로 낮게/);
    assert.doesNotMatch(text, /여운|꽃|시트러스|훈련|개선|\d+(?:\.\d+)?점/);
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()), beforeScores);
  assert.equal(api.db.prepare('SELECT evidence FROM narrative_preservation WHERE id = ?').get('saved-preliminary').evidence, savedEvidence);
  console.log('Coffee evidence narrative passed: KCR/IKRC, 5 concise paragraphs, observed qualities only, score/intensity distinction, original-note retention, no saved-data changes.');
  console.log('KCR candidate:\n' + result.comments[0]);
  console.log('IKRC candidate:\n' + ikrc.comments[0]);
} finally {
  api.close();
}
