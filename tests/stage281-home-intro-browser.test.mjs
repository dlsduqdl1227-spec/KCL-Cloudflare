import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const qa=await createBrowserFixture(),out='tmp/stage281-qa';fs.mkdirSync(out,{recursive:true});
const visibleHome=async page=>{
 assert.equal(await page.locator('.home-shell').evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.equal(await page.locator('.home-actions a').count(),3);
 assert.equal((await inspectPage(page)).pageOverflow,false);
 assert.deepEqual(page.qaErrors,[]);
};
try{
 for(const width of [360,768,1440]){
  const page=await qa.page(width,950);await page.goto(qa.origin+'/');
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('kcl-home-intro')),true);
  await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=150;}));
  const first=await page.locator('#kcl-home-splash').evaluate(el=>({opacity:+getComputedStyle(el).opacity,pointer:getComputedStyle(el).pointerEvents}));
  assert.equal(first.opacity,1);assert.equal(first.pointer,'none');
  const logo=await page.locator('#kcl-home-splash-logo').evaluate(el=>{const r=el.getBoundingClientRect();return {loaded:el.complete&&el.naturalWidth>0,x:r.x+r.width/2,y:r.y+r.height/2,width:r.width};});
  assert.ok(logo.loaded);assert.ok(Math.abs(logo.x-width/2)<2);assert.ok(Math.abs(logo.y-950/2)<2);assert.ok(logo.width<=280);
  await page.screenshot({path:out+'/logo-'+width+'.png'});
  await page.evaluate(()=>document.getAnimations().forEach(a=>a.currentTime=950));
  const fading=await page.locator('#kcl-home-splash').evaluate(el=>+getComputedStyle(el).opacity);assert.ok(fading>0&&fading<1,'logo backdrop fades progressively');
  assert.ok(await page.locator('#kcl-home-splash-logo').evaluate(el=>getComputedStyle(el).filter!=='blur(0px)'));
  await page.screenshot({path:out+'/transition-'+width+'.png'});
  await page.evaluate(()=>document.getAnimations().forEach(a=>a.play()));
  await page.waitForFunction(()=>!document.documentElement.classList.contains('kcl-home-intro'));
  assert.equal(await page.locator('#kcl-home-splash').count(),0);await visibleHome(page);
  await page.screenshot({path:out+'/home-'+width+'.png'});
  await page.reload();assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('kcl-home-intro')),false);await visibleHome(page);await page.close();
 }
 const reduced=await qa.page(390,900,{reducedMotion:'reduce'});await reduced.goto(qa.origin+'/');assert.equal(await reduced.locator('html').evaluate(el=>el.classList.contains('kcl-home-intro')),false);await visibleHome(reduced);await reduced.close();
 const noJs=await qa.page(390,900,{javaScriptEnabled:false});await noJs.goto(qa.origin+'/');await visibleHome(noJs);assert.equal(await noJs.locator('#kcl-home-splash').isVisible(),false);await noJs.close();
 const brokenCss=await qa.page();await brokenCss.route('**/assets/home-intro.css*',route=>route.abort());await brokenCss.goto(qa.origin+'/');await visibleHome(brokenCss);assert.equal(await brokenCss.locator('#kcl-home-splash').isVisible(),false);await brokenCss.waitForFunction(()=>!document.documentElement.classList.contains('kcl-home-intro'));await brokenCss.close();
 const brokenLogo=await qa.page();await brokenLogo.route('**/assets/logos/kcl.svg',route=>route.abort());await brokenLogo.goto(qa.origin+'/');await brokenLogo.waitForFunction(()=>!document.documentElement.classList.contains('kcl-home-intro'));await visibleHome(brokenLogo);await brokenLogo.close();
 const keyboard=await qa.page();await keyboard.goto(qa.origin+'/');await keyboard.keyboard.press('Tab');assert.equal(await keyboard.locator('html').evaluate(el=>el.classList.contains('kcl-home-intro')),false);assert.equal(await keyboard.locator('.kcl-skip-link').evaluate(el=>el===document.activeElement),true);await keyboard.close();
 const liveMotion=await qa.page();await liveMotion.goto(qa.origin+'/');await liveMotion.emulateMedia({reducedMotion:'reduce'});await liveMotion.waitForFunction(()=>!document.documentElement.classList.contains('kcl-home-intro'));await visibleHome(liveMotion);await liveMotion.close();
 const click=await qa.page();await click.addInitScript(()=>{localStorage.setItem('kclAssessmentSession','{"judgeToken":"KEEP_EXISTING_SESSION"}');localStorage.setItem('kcl.evalDraft.qa','KEEP_EXISTING_SCORES_AND_COMMENTS');});await click.goto(qa.origin+'/');
 assert.equal(await click.evaluate(()=>localStorage.getItem('kclAssessmentSession')),'{"judgeToken":"KEEP_EXISTING_SESSION"}');assert.equal(await click.evaluate(()=>localStorage.getItem('kcl.evalDraft.qa')),'KEEP_EXISTING_SCORES_AND_COMMENTS');
 await click.locator('.home-actions a').first().click();assert.equal(new URL(click.url()).pathname,'/assessment/','intro must never block navigation');await click.close();
 console.log('Stage281: centered existing KCL logo, progressive fade/home reveal at 360/768/1440px, once-per-tab, keyboard/click skip, reduced motion, no-JS/CSS/image fail-open and existing session/draft preservation passed.');
}finally{await qa.close();}
