/* A short first-visit flourish, independent of authentication and evaluation drafts. */
(function(){
 'use strict';
 var root=document.documentElement,media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
 if(!media||media.matches)return;
 var key='kcl.homeIntro.seen.v1';
 try{if(sessionStorage.getItem(key)==='1')return;}catch(e){}
 // Returning from a judging screen should never delay access to the home menu.
 var navigation=window.performance&&performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
 if(navigation&&navigation.type==='back_forward')return;
 try{sessionStorage.setItem(key,'1');}catch(e){}
 var finished=false,timer;
 function finish(){
  if(finished)return;finished=true;clearTimeout(timer);root.classList.remove('kcl-home-intro');
  var splash=document.getElementById('kcl-home-splash');if(splash)splash.remove();
  document.removeEventListener('animationend',ended);
  document.removeEventListener('pointerdown',finish,true);document.removeEventListener('keydown',finish,true);
  document.removeEventListener('error',imageFailed,true);window.removeEventListener('pageshow',restored);
  if(media.removeEventListener)media.removeEventListener('change',motionChanged);
 }
 function ended(event){if(event.target.id==='kcl-home-splash'&&event.animationName==='kcl-splash-exit')finish();}
 function imageFailed(event){if(event.target.id==='kcl-home-splash-logo')finish();}
 function restored(event){if(event.persisted)finish();}
 function motionChanged(event){if(event.matches)finish();}
 root.classList.add('kcl-home-intro');
 // CSS finishes the reveal even without this cleanup. The timer is a second fail-safe.
 timer=setTimeout(finish,1900);
 document.addEventListener('animationend',ended);
 document.addEventListener('pointerdown',finish,true);document.addEventListener('keydown',finish,true);
 document.addEventListener('error',imageFailed,true);window.addEventListener('pageshow',restored);
 if(media.addEventListener)media.addEventListener('change',motionChanged);
})();
