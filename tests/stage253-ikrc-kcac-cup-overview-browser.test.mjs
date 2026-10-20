import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const qa=await createBrowserFixture();
fs.mkdirSync('tmp/stage253-navigation',{recursive:true});
async function checkOverview(page,prefix,count) {
  const layout=await page.locator('#'+prefix+'-cup-overview').evaluate(el=>({
    width:el.clientWidth,scrollWidth:el.scrollWidth,
    bounds:el.getBoundingClientRect().toJSON(),
    buttons:[...el.querySelectorAll('.cup-btn')].map(b=>({
      ...b.getBoundingClientRect().toJSON(),circle:b.querySelector('.cup-btn-num').getBoundingClientRect().toJSON(),
      radius:getComputedStyle(b.querySelector('.cup-btn-num')).borderRadius
    }))
  }));
  assert.equal(layout.buttons.length,count);
  assert.equal(new Set(layout.buttons.map(b=>b.top)).size,1,'one physical row');
  assert.ok(layout.scrollWidth<=layout.width+1,'no horizontal navigation carousel');
  assert.ok(layout.buttons.every(b=>b.left>=layout.bounds.left-1&&b.right<=layout.bounds.right+1&&b.height>=44));
  assert.ok(layout.buttons.every(b=>b.radius==='50%'&&Math.abs(b.circle.width-b.circle.height)<1));
  for(const dir of ['previous','next']) {
    assert.equal(await page.locator('#'+prefix+'-'+dir+'-cup').evaluate(el=>{
      const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;
    }),true,'large previous/next targets');
  }
  assert.equal((await inspectPage(page)).pageOverflow,false);
}
try {
  for(const width of [320,390,768,1440]) {
    const page=await qa.page(width,900,width<400?{isMobile:true,hasTouch:true}:{});
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(()=>{
      _judge={name:'QA 관리자',type:'ADMIN',accountType:'ADMIN',role:'관리자',judgeToken:'local-test-only',access:'ALL'};
      refreshParticipantAssignmentsForActiveComp_=()=>{};
      // This fixture deliberately replaces one station with several synthetic
      // cup counts. Do not auto-accept restoration of a previous fixture case.
      // Draft restoration itself is covered by the separate lifecycle tests.
      kclMaybeRestoreDraftForActiveEval_=()=>{};
    });
    for(const count of [1,7,9,10,20]) {
      await page.evaluate(count=>{
        _selComp={code:'IKRC',currentRound:'예선',name:'IKRC',isActive:true};
        setEvaluationPurpose_('competition');
        initIkrcSamples(Array.from({length:count},(_,i)=>'A-'+(i+1)),{id:'qa',label:'QA 스테이션'});
        _ikrcSamples.forEach((s,i)=>{
          s.flavor=Number((4.2+i*.2).toFixed(1));s.comment='직접 기록 '+i;s.selectedTagsFlavor=['독립 태그 '+i];s.flavorLocked=i===0;
        });
        loadIkrcSample(0);
      },count);
      await checkOverview(page,'ikrc',count);
      assert.equal(await page.locator('#ikrc-current-number').textContent(),'Cup A-1');
      const before=await page.evaluate(()=>JSON.stringify(_ikrcSamples));
      if(count>1) {
        await page.locator('#ikrc-next-cup').click();
        assert.equal(await page.locator('#ikrc-current-number').textContent(),'Cup A-2');
        await page.locator('#ikrc-previous-cup').click();
        await page.locator('#ikrc-cup-overview .cup-btn').last().click();
        assert.equal(await page.locator('#ikrc-next-cup').isDisabled(),true);
        await page.locator('#ikrc-cup-overview .cup-btn').first().click();
      }
      assert.equal(await page.locator('#ikrc-score-slider').inputValue(),'4.2');
      assert.equal(await page.locator('#ikrc-score-slider').isDisabled(),true);
      assert.equal(await page.evaluate(()=>JSON.stringify(_ikrcSamples)),before);
      await page.evaluate(()=>{switchIkrcSample_(-1);switchIkrcSample_(100);});
      assert.equal(await page.evaluate(()=>JSON.stringify(_ikrcSamples)),before,'invalid navigation does not save or move');
    }
    await page.screenshot({path:`tmp/stage253-navigation/ikrc-${width}.png`});
    for(const pattern of ['dynamic','controlled']) {
      await page.evaluate(()=>{
        _selComp={code:'KCAC',currentRound:'예선',name:'KCAC',isActive:true};
        startKcac();
      });
      await page.waitForFunction(()=>_kcac.jars[0]?.scores?.균형===3&&document.querySelector('#kcac-attrs input[data-kcac-score]'));
      assert.equal(await page.locator('#kcac-cup-nav').isVisible(),false,'participant selection gates cup nav');
      await page.locator('#kcac-num').fill('1');
      await page.evaluate(()=>onKcacParticipantSelected_());
      assert.equal(await page.locator('#kcac-cup-nav').isVisible(),false,'pattern assignment gates cup nav');
      await page.evaluate(pattern=>setKcacQualFirstPattern_(pattern),pattern);
      await page.evaluate(()=>{
        _kcac.jars.forEach((j,i)=>{
          KCAC_QUAL_ATTRS.forEach(a=>{j.scores[a.key]=3;});
          j.scores.완성도=i===0?4.4:2.2;j.scoreLocks.완성도=i===0;
          j.smartTags.완성도=['패턴 원문 '+i];j.leafCount=i===0?'16':'8';
          j.photoSrc='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S0AAAAASUVORK5CYII=';
          j.mediaName='QA 원본 '+i;
        });
        _kcac.overallComment='직접 입력한 두 잔의 종합 기록';
        loadKcacJar(_kcac.currentIdx);
      });
      await checkOverview(page,'kcac',2);
      assert.deepEqual(await page.locator('#kcac-cup-overview .cup-btn-num').allTextContents(),['1','2']);
      assert.equal(await page.locator('#kcac-current-number').textContent(),'1번 컵 · '+(pattern==='dynamic'?'FAST Rosetta':'SLOW Rosetta'));
      const saved=await page.evaluate(()=>JSON.stringify(_kcac.jars.map(j=>({
        patternType:j.patternType,scores:j.scores,smartTags:j.smartTags,scoreLocks:j.scoreLocks,
        leafCount:j.leafCount,photoSrc:j.photoSrc,mediaName:j.mediaName
      }))));
      await page.locator('#kcac-next-cup').click();
      assert.equal(await page.locator('#kcac-current-number').textContent(),'2번 컵 · '+(pattern==='dynamic'?'SLOW Rosetta':'FAST Rosetta'));
      await page.locator('#kcac-previous-cup').click();
      assert.equal(await page.locator('#kcac-attrs input[data-kcac-score="완성도"]').inputValue(),pattern==='dynamic'?'4.4':'2.2');
      assert.equal(await page.locator('#kcac-attrs input[data-kcac-score="완성도"]').isDisabled(),pattern==='dynamic');
      await page.locator('#kcac-cup-nav > .submit-btn-nav').click();
      assert.equal(await page.locator('#kcac-current-number').textContent(),'종합코멘트');
      assert.equal(await page.locator('#kcac-cup-overview .cup-btn.active').count(),0);
      assert.equal(await page.locator('#kcac-comment').inputValue(),'직접 입력한 두 잔의 종합 기록');
      await page.locator('#kcac-comment').fill('종합 기록 수정 원문');
      await page.locator('#kcac-previous-cup').click();
      assert.match(await page.locator('#kcac-current-number').textContent(),/^2번 컵/);
      assert.equal(await page.evaluate(()=>_kcac.overallComment),'종합 기록 수정 원문');
      assert.equal(await page.evaluate(()=>JSON.stringify(_kcac.jars.map(j=>({
        patternType:j.patternType,scores:j.scores,smartTags:j.smartTags,scoreLocks:j.scoreLocks,
        leafCount:j.leafCount,photoSrc:j.photoSrc,mediaName:j.mediaName
      })))),saved,'switching physical cups preserves independent pattern storage');
      assert.equal(await page.locator('#kcac-submit-dock').isVisible(),true);
    }
    await page.screenshot({path:`tmp/stage253-navigation/kcac-${width}.png`});
    for(const area of ['sensory','pattern']) {
      await page.evaluate(area=>{
        _selComp={code:'KCAC',currentRound:'결선',name:'KCAC',isActive:true};startKcac(area);
      },area);
      await page.waitForFunction(area=>{
        const key=area==='sensory'?'맛균형':'완성도';
        return _kcac.jars[0]?.scores?.[key]===3&&document.querySelector('#kcac-attrs input[data-kcac-score="'+key+'"]');
      },area);
      await page.locator('#kcac-num').fill('1');
      await page.evaluate(()=>onKcacParticipantSelected_());
      await checkOverview(page,'kcac',area==='sensory'?2:1);
      assert.equal(await page.locator('#kcac-cup-nav > .submit-btn-nav').isVisible(),false,'final submission stays in existing submit dock');
      assert.equal(await page.locator('#kcac-submit-dock').isVisible(),true);
    }
    assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
    await page.close({runBeforeUnload:false});
  }
} finally {await qa.close();}
console.log('Stage253 IKRC/KCAC circular overview, physical order, current-cup controls and independent evaluation data passed at 320/390/768/1440px.');
