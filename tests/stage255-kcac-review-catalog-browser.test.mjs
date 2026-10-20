import assert from 'node:assert/strict';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';

const qa = await createBrowserFixture();
try {
  const page = await qa.page(390);
  await page.goto(qa.origin + '/assessment/');
  const checks = await page.evaluate(() => {
    const cases = [
      {type:'qual', patternType:'dynamic', attrs:KCAC_QUAL_ATTRS},
      {type:'qual', patternType:'controlled', attrs:KCAC_QUAL_ATTRS},
      {type:'final-pattern', attrs:KCAC_FINAL_PATTERN_ATTRS},
      {type:'final-sensory', attrs:KCAC_FINAL_SENSORY_ATTRS},
    ];
    return cases.flatMap(jar => {
      _reviewState.current = {'패턴종류':jar.patternType || ''};
      return jar.attrs.map(attr => {
        const header = kcacSmartTagHeader_(jar, attr.key);
        const meta = reviewKcacSmartTagMeta_(header);
        return {header, pattern:jar.patternType, actual:meta && meta.data, expected:kcacSmartTagOptions_(jar, attr.key)};
      });
    });
  });
  for (const check of checks) assert.deepEqual(check.actual, check.expected, check.header + ' / ' + (check.pattern || 'final'));
  const aliases = await page.evaluate(() => {
    _reviewState.current = {};
    return ['예선 Pattern Balance 스마트태그', '예선 패턴 균형 스마트태그', '예선 대칭과 균형 스마트태그']
      .map(header => ({header, meta:reviewKcacSmartTagMeta_(header)}));
  });
  for (const alias of aliases) assert.ok(alias.meta, alias.header + ' retains legacy review support');
  assert.deepEqual(page.qaErrors, []);
  assert.deepEqual(page.qaMissing, []);
  console.log('Stage255 KCAC preliminary FAST/SLOW and final pattern/sensory catalogs match evaluation and review across all 19 attribute cases.');
} finally {
  await qa.close();
}
