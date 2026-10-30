import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const qa=await createBrowserFixture();
fs.mkdirSync('tmp/stage263-qa',{recursive:true});
try {
  for(const width of [320,390,1440]) {
    const page=await qa.page(width,900);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(()=>{
      _judge={name:'로컬 검수',type:'ADMIN',accountType:'ADMIN',role:'관리자',judgeToken:'local-only',access:'ALL'};
      refreshParticipantAssignmentsForActiveComp_=()=>{};
      kclMaybeRestoreDraftForActiveEval_=()=>{};
      window.qaComments=[];window.qaSubmissions=[];
      function runner(success,failure){return new Proxy({},{get(_,key){
        if(key==='withSuccessHandler')return fn=>runner(fn,failure);
        if(key==='withFailureHandler')return fn=>runner(success,fn);
        return (...args)=>{
          if(key==='generateKbcComment'){qaComments.push({success,failure,payload:args[0]});return;}
          if(key==='submitScores'){qaSubmissions.push(args[0]);return;}
          if(success)success({success:true,assignments:[],list:[],competitions:[],configs:[]});
        };
      }});}
      google.script.run=runner();
    });
    for(const round of ['예선','본선','결선']) {
      await page.evaluate(round=>{hideOverlay();hideEval();_selComp={code:'KBC',name:'KBC',currentRound:round,isActive:true};startKbc();},round);
      assert.equal(await page.locator('#kbc-auto-comment-reset').count(),0);
      const order=await page.evaluate(()=>{
        const ids=['kbc-machine-rows','kbc-comment','kbc-end-time','kbc-final-big'];
        const elems=ids.map(id=>document.getElementById(id));
        elems.push(document.querySelector('#evalKbc button[onclick="kbcSubmit()"]'));
        return elems.every((el,i)=>!i||!!(elems[i-1].compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING));
      });
      assert.equal(order,true,'time and final score follow evaluation and comments');
      await page.locator('#kbc-num').fill('9');
      await page.locator('#kbc-comment').fill('심사위원이 직접 작성한 종합 의견을 유지합니다.');
      await page.locator('#evalKbc button[onclick="kbcSubmit()"]').click();
      assert.equal(await page.locator('#kbc-end-time').evaluate(el=>el===document.activeElement),true,'missing time focuses the bottom input');
      const base=round==='예선'?21:36;
      const limit=round==='예선'?'0700':'1000';
      const over=round==='예선'?'0705':'1005';
      const dq=round==='예선'?'0800':'1100';
      await page.getByLabel('경기시간',{exact:true}).fill(limit);
      assert.equal(await page.locator('#kbc-end-time').inputValue(),round==='예선'?'07분00초':'10분00초');
      assert.equal(await page.locator('#kbc-final-big').innerText(),base.toFixed(1));
      await page.getByLabel('경기시간',{exact:true}).fill(over);
      assert.match(await page.locator('#kbc-time-status').innerText(),/자동감점 -1점/);
      assert.equal(await page.locator('#kbc-final-big').innerText(),(base-1).toFixed(1));
      await page.getByLabel('경기시간',{exact:true}).fill(dq);
      assert.match(await page.locator('#kbc-time-status').innerText(),/^실격/);
      await page.getByLabel('경기시간',{exact:true}).fill(over);
      await page.locator('#evalKbc button[onclick="kbcSubmit()"]').click();
      const payload=await page.evaluate(()=>qaSubmissions.at(-1));
      assert.equal(payload.competitionCode,'KBC');
      assert.equal(payload.rows[0].extraFields['경기시간'],round==='예선'?'07분05초':'10분05초');
      assert.equal(payload.rows[0].extraFields['시간감점'],1);
      assert.equal(payload.rows[0].extraFields['총점'],base-1);
      await page.evaluate(()=>{hideOverlay();_kbcSubmitting=false;});
      assert.equal((await inspectPage(page)).pageOverflow,false);
    }
    const generate=page.locator('#kbc-auto-comment-generate');
    const disable=page.locator('#kbc-auto-comment-disable');
    const area=page.locator('#kbc-comment-gen');
    const comment=page.locator('#kbc-comment');
    await page.evaluate(()=>{_kbcTags.service['Service Professionalism']=['설명 명확'];});
    const before=await page.evaluate(()=>({tags:JSON.stringify(_kbcTags),time:val_('kbc-end-time'),total:document.getElementById('kbc-total').textContent}));
    await generate.click();
    assert.equal(await generate.isDisabled(),true);
    await disable.click();
    await page.evaluate(()=>qaComments.at(-1).success({comments:['취소된 요청의 늦은 응답']}));
    assert.equal(await generate.isEnabled(),true);
    assert.equal(await area.innerText(),'');
    assert.match(await comment.inputValue(),/직접 작성/);
    await generate.click();
    await page.evaluate(()=>qaComments.at(-1).success({comments:['새로 생성한 코멘트 초안입니다.']}));
    await area.locator('.comment-variation').click();
    await disable.click();
    assert.equal(await comment.inputValue(),'','only an unedited generated draft is removed');
    await generate.click();
    await page.evaluate(()=>qaComments.at(-1).success({comments:['다시 생성한 코멘트 초안입니다.']}));
    await area.locator('.comment-variation').click();
    await comment.fill('심사위원이 직접 수정한 코멘트는 사용 해제 후에도 보존합니다.');
    await disable.click();
    assert.match(await comment.inputValue(),/직접 수정/);
    const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem(kclDraftKey_('KBC'))));
    assert.equal(draft.state.kbcCommentMeta.autoEnabled,false,'turning off AI immediately persists the draft');
    await page.clock.install();
    await generate.click();
    const timedOutRequest=await page.evaluate(()=>qaComments.length-1);
    await page.clock.fastForward(20001);
    assert.equal(await generate.isEnabled(),true);
    assert.equal(await area.getByRole('button',{name:'다시 시도',exact:true}).isVisible(),true);
    assert.doesNotMatch(await area.innerText(),/초기화/);
    await area.getByRole('button',{name:'다시 시도',exact:true}).click();
    await page.evaluate(index=>qaComments[index].success({comments:['시간 초과된 이전 요청']}),timedOutRequest);
    assert.doesNotMatch(await area.innerText(),/시간 초과된 이전 요청/);
    await page.evaluate(()=>qaComments.at(-1).success({comments:['재시도 성공 코멘트']}));
    assert.match(await area.innerText(),/재시도 성공/);
    assert.match(await comment.inputValue(),/직접 수정/);
    await disable.click();
    const after=await page.evaluate(()=>({tags:JSON.stringify(_kbcTags),time:val_('kbc-end-time'),total:document.getElementById('kbc-total').textContent}));
    assert.deepEqual(after,before);
    await page.clock.fastForward(4000);
    await page.setViewportSize({width,height:1100});
    await page.evaluate(()=>{
      const actions=document.querySelector('#evalKbc .ikrc-comment-actions');
      actions.scrollIntoView({block:'start',behavior:'instant'});
    });
    await page.screenshot({path:`tmp/stage263-qa/kbc-finish-${width}.png`,animations:'disabled'});
    if(width===390) {
      await page.evaluate(()=>{
        hideEval();showPanel('pReviewEdit');
        _reviewState={code:'KBC',headers:['참가자번호','종합코멘트','총점'],current:{rowIndex:1,'참가자번호':'9','종합코멘트':'검수자가 직접 작성한 의견','총점':35}};
        // Isolate comment controls from persistence; the existing review API suite covers saving.
        scheduleReviewAutoSave=()=>{};
        document.getElementById('review-edit-fields').innerHTML='';
        ensureReviewOverallCard_();
      });
      const review=page.locator('#review-overall-card');
      const reviewGenerate=review.getByRole('button',{name:'AI 코멘트 생성 / 다시 생성',exact:true});
      const reviewDisable=review.getByRole('button',{name:'AI 코멘트 사용 안 함',exact:true});
      const reviewArea=page.locator('#review-gen-comment-area-1');
      assert.equal(await reviewDisable.isVisible(),true);
      assert.doesNotMatch(await review.innerText(),/초기화/);
      await reviewGenerate.click();
      await reviewDisable.click();
      await page.evaluate(()=>qaComments.at(-1).success({comments:['취소된 검수 요청']}));
      assert.equal(await reviewArea.innerText(),'');
      assert.equal(await review.locator('textarea').inputValue(),'검수자가 직접 작성한 의견');
      await reviewGenerate.click();
      await page.clock.fastForward(20001);
      await reviewArea.getByRole('button',{name:'다시 시도',exact:true}).click();
      await page.evaluate(()=>qaComments.at(-1).success({comments:['검수 재생성 성공']}));
      await reviewArea.locator('.comment-variation').click();
      await reviewDisable.click();
      assert.equal(await review.locator('textarea').inputValue(),'');
      await review.locator('textarea').fill('직접 수정한 검수 의견');
      await reviewDisable.click();
      assert.equal(await review.locator('textarea').inputValue(),'직접 수정한 검수 의견');
    }
    assert.deepEqual(page.qaErrors,[]);
    assert.deepEqual(page.qaMissing,[]);
    await page.close();
  }
}finally{await qa.close();}
console.log('Stage263: KBC time-at-bottom, time penalties/submission across all rounds, AI off/regenerate in evaluation and review, edited text and draft preservation, timeout retry and stale-response rejection passed at 320/390/1440px.');
