import assert from 'node:assert/strict';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';

// All traffic stays in the local fixture; no production evaluation is submitted.
const qa = await createBrowserFixture();
try {
  for (const width of [390, 1280]) {
    for (const mode of ['qual', 'pattern', 'sensory']) {
      const page = await qa.page(width, 900, width < 400 ? {isMobile:true, hasTouch:true} : {});
      await page.goto(qa.origin + '/assessment/');
      await page.evaluate(mode => {
        localStorage.clear();
        _judge = {name:'QA 관리자', type:'ADMIN', accountType:'ADMIN', role:'관리자', judgeToken:'local-only', access:'ALL'};
        _selComp = {code:'KCAC', name:'KCAC', currentRound:mode === 'qual' ? '예선' : '결선', isActive:true};
        refreshParticipantAssignmentsForActiveComp_ = () => {};
        // Invoke the real restore function deterministically, without its delayed prompt.
        kclMaybeRestoreDraftForActiveEval_ = () => {};
        startKcac(mode);
      }, mode);
      await page.waitForFunction(() => document.querySelector('#kcac-attrs [data-kcac-score]'));

      await page.evaluate(mode => {
        document.getElementById('kcac-num').value = '17';
        if (mode === 'qual') setKcacQualFirstPattern_('controlled');
        onKcacParticipantSelected_();
        _kcac.jars.forEach((jar, index) => {
          const attrs = jar.type === 'qual' ? KCAC_QUAL_ATTRS
            : jar.type === 'final-pattern' ? KCAC_FINAL_PATTERN_ATTRS : KCAC_FINAL_SENSORY_ATTRS;
          attrs.forEach(attr => {
            jar.scores[attr.key] = index === 0 ? 4.2 : 2.4;
            jar.scoreLocks[attr.key] = true;
            jar.smartTags[attr.key] = ['QA ' + (index + 1) + '번 잔 직접 기록'];
          });
          if (jar.type === 'final-pattern') jar.smartTags['완성도'].push('패턴 구조 완성');
          jar.comment = (index + 1) + '번 잔의 기존 종합코멘트 유지';
          jar.commentEdited = true;
          jar.generatedComment = '';
        });
        _kcac.overallComment = 'FAST와 SLOW를 함께 작성한 기존 종합코멘트 유지';
        _kcac.overallCommentEdited = true;
        loadKcacJar(_kcac.jars.length - 1);
        window.qaDraftStateSnapshot = () => ({
          currentIdx:_kcac.currentIdx,
          qualFirstPattern:_kcac.qualFirstPattern,
          overallComment:_kcac.overallComment,
          jars:_kcac.jars.map(jar => ({
            type:jar.type, patternType:jar.patternType,
            scores:JSON.parse(JSON.stringify(jar.scores)),
            smartTags:JSON.parse(JSON.stringify(jar.smartTags)),
            scoreLocks:JSON.parse(JSON.stringify(jar.scoreLocks)),
            comment:jar.comment, commentEdited:jar.commentEdited,
          })),
        });
        window.qaDraft = {
          state:kclBuildDraftState_('KCAC'),
          form:kclCollectFormValues_(document.getElementById('evalKcac')),
        };
        window.qaExpectedDraftState = qaDraftStateSnapshot();
        // A new entry initially has no participant and no visible evaluation controls.
        startKcac(mode);
      }, mode);
      await page.waitForFunction(() => {
        const input = document.querySelector('#kcac-attrs [data-kcac-score]');
        return input && !input.disabled;
      });
      assert.equal(await page.locator('#kcac-num').inputValue(), '');
      assert.equal(await page.locator('#kcac-cup-nav').isVisible(), false);
      assert.equal(await page.locator('#kcac-evaluation-body').isVisible(), false);
      assert.equal(await page.locator('#kcac-submit-dock').isVisible(), false);

      await page.evaluate(() => kclRestoreDraftForCode_('KCAC', qaDraft));
      assert.equal(await page.locator('#kcac-num').inputValue(), '17');
      assert.equal(await page.locator('#kcac-evaluation-body').isVisible(), true, mode + ' restores the evaluation body');
      assert.equal(await page.locator('#kcac-submit-dock').isVisible(), true, mode + ' restores submission access');
      assert.equal(await page.locator('#kcac-cup-nav').isVisible(), mode !== 'pattern', 'navigation appears only for multiple cups');
      const state = await page.evaluate(() => ({actual:qaDraftStateSnapshot(), expected:qaExpectedDraftState}));
      assert.deepEqual(state.actual, state.expected, 'restoring visibility must not alter scores, tags, comments, locks or cup identity');
      assert.equal(await page.locator('#kcac-attrs [data-kcac-score]').first().isDisabled(), true, 'restored slider lock remains active');
      const displayed = await page.evaluate(() => {
        const jar = _kcac.jars[_kcac.currentIdx];
        const key = Object.keys(jar.scores)[0];
        return {
          slider:document.querySelector('#kcac-attrs [data-kcac-score]').value,
          score:jar.scores[key],
          comment:document.getElementById('kcac-comment').value,
          expectedComment:kcacIsUnifiedQualComment_() ? _kcac.overallComment : jar.comment,
        };
      });
      assert.equal(Number(displayed.slider), displayed.score);
      assert.equal(displayed.comment, displayed.expectedComment);
      assert.deepEqual(page.qaErrors, []);
      assert.deepEqual(page.qaMissing, []);
      await page.close();
      console.log(`Stage254 KCAC ${mode} draft visibility and data preservation passed at ${width}px.`);
    }
  }
} finally {
  await qa.close();
}
