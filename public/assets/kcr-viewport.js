(function () {
  'use strict';
  var selector = '#evalCupping.active,#pReview.active[data-competition="KCR"],#pReviewEdit.active[data-competition="KCR"]';
  var frame = 0, focusTimer = 0, revealRequested = false;
  function keyboardField(el) {
    return !!(el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|file|hidden)$/i.test(el.type))));
  }
  function revealField(screen) {
    var field = document.activeElement;
    if (!keyboardField(field) || !screen.contains(field)) return;
    var scroller = field.closest('.eval-content');
    if (!scroller) return;
    var box = field.getBoundingClientRect(), area = scroller.getBoundingClientRect();
    // Only scroll this form, never scroll/rebuild the page or change any input value.
    if (box.top < area.top + 12 || box.bottom > area.bottom - 12) {
      scroller.scrollTop += box.top - area.top - Math.max(12,(area.height - box.height)/2);
    }
  }
  function update() {
    frame = 0;
    var shouldReveal = revealRequested; revealRequested = false;
    var screen = document.querySelector(selector), root = document.documentElement;
    document.body.classList.toggle('kcr-viewport-active', !!screen);
    if (!screen) {
      document.body.classList.remove('kcr-keyboard-open');
      root.style.removeProperty('--kcr-viewport-height');
      root.style.removeProperty('--kcr-viewport-top');
      return;
    }
    var viewport = window.visualViewport;
    // Do not chase intentional pinch zoom or turn it into a layout resize.
    if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
    var height = viewport ? viewport.height : window.innerHeight;
    if (!height || !Number.isFinite(height)) return;
    root.style.setProperty('--kcr-viewport-height', height + 'px');
    root.style.setProperty('--kcr-viewport-top', Math.max(0,viewport ? viewport.offsetTop : 0) + 'px');
    document.body.classList.toggle('kcr-keyboard-open', keyboardField(document.activeElement) && window.innerHeight - height > 100);
    if (shouldReveal) revealField(screen);
  }
  function schedule(reveal) { revealRequested = revealRequested || reveal === true; if (!frame) frame = requestAnimationFrame(update); }
  var observer = new MutationObserver(function() { schedule(); });
  ['evalCupping','pReview','pReviewEdit'].forEach(function(id) {
    var screen = document.getElementById(id);
    if (screen) observer.observe(screen,{attributes:true,attributeFilter:['class','data-competition']});
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize',function() { schedule(true); });
    window.visualViewport.addEventListener('scroll',function() { schedule(); });
  }
  window.addEventListener('resize',function() { schedule(true); });
  document.addEventListener('focusin',function() {
    clearTimeout(focusTimer); schedule(true); focusTimer = setTimeout(function() { schedule(true); },360);
  });
  document.addEventListener('focusout',function() { clearTimeout(focusTimer); schedule(); });
  schedule();
})();
