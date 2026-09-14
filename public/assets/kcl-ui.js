(function () {
  'use strict';
  var pendingActions = new WeakMap();
  window.kclUi = {
    beginAction: function (button, waitingText, onTimeout) {
      if (!button || pendingActions.has(button)) return null;
      var originalText = button.textContent;
      var finished = false;
      var timer;
      var action = {finish:function () {
        if (finished) return false;
        finished = true; clearTimeout(timer); pendingActions.delete(button);
        button.disabled = false; button.removeAttribute('aria-busy');
        if (button.textContent === waitingText) button.textContent = originalText;
        return true;
      }};
      pendingActions.set(button, action);
      button.disabled = true; button.setAttribute('aria-busy','true'); button.textContent = waitingText;
      timer = setTimeout(function () { if(action.finish() && onTimeout) onTimeout(); }, 45000);
      return action;
    }
  };
  function installCommonNavigation() {
    if (location.pathname === '/' || location.pathname === '/index.html') return;
    var nav = document.querySelector('.global-nav-buttons');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'global-nav-buttons';
      nav.innerHTML = '<button type="button" class="global-nav-btn">← 뒤로가기</button><button type="button" class="global-nav-btn"><span class="home-dot"></span>홈</button>';
      nav.children[0].onclick = function () {
        if (typeof window.goBackContext_ === 'function') return window.goBackContext_();
        var sameOrigin = false;
        try { sameOrigin = new URL(document.referrer).origin === location.origin; } catch(e) {}
        if (sameOrigin && history.length > 1) history.back();
        else location.href = location.pathname.startsWith('/registry') ? '/admin/' : '/';
      };
      nav.children[1].onclick = function () { location.href = '/'; };
      document.body.prepend(nav);
      document.body.classList.add('kcl-added-navigation');
    }
    nav.setAttribute('aria-label','페이지 이동');
    var back = nav.querySelector('.global-nav-btn');
    if (back) back.textContent = '← 뒤로가기';
    document.querySelectorAll('.nav a[href="/"],a.home[href="/"],.kcl-camera-home').forEach(function(el){el.hidden=true;el.classList.add('kcl-replaced-home');});
  }
  installCommonNavigation();
  // Enhance only semantics and keyboard input; never read/write evaluation values or storage.
  function nameControl(el) {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || (el.labels && el.labels.length)) return;
    var field = el.closest('.form-field,.control,.score-row,.review-field');
    var label = field && field.querySelector('.field-label,.score-label,.score-row-name,label,.label');
    var name = label && label.textContent.trim();
    if (!name) name = el.getAttribute('placeholder') || el.getAttribute('title');
    if (name) el.setAttribute('aria-label', name);
  }
  function enhance(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = Array.from(root.querySelectorAll('input,select,textarea,[onclick]'));
    if (root.matches && root.matches('input,select,textarea,[onclick]')) nodes.unshift(root);
    nodes.forEach(function (el) {
      if (el.matches('input,select,textarea')) { nameControl(el); return; }
      if (el.matches('button,a,input,select,textarea,summary,canvas') || el.querySelector('button,a[href],input,select,textarea,[onclick]')) return;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    });
  }
  enhance(document);
  // Child-list observation avoids doing work on every slider value/style update.
  new MutationObserver(function (records) {
    var roots = new Set();
    records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1) roots.add(node); }); });
    roots.forEach(enhance);
  }).observe(document.body, {childList:true, subtree:true});
  document.addEventListener('keydown', function (event) {
    var el = event.target;
    if (el.matches('[role="tab"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      var tablist = el.closest('[role="tablist"]');
      if (!tablist) return;
      var tabs = Array.from(tablist.querySelectorAll('[role="tab"]')).filter(function(tab){return !tab.disabled && tab.getClientRects().length && !tab.hidden;});
      if (!tabs.length) return;
      var index = tabs.indexOf(el);
      var next = event.key === 'Home' ? 0 : (event.key === 'End' ? tabs.length-1 : (index + (event.key==='ArrowRight'?1:-1) + tabs.length) % tabs.length);
      event.preventDefault(); tabs[next].focus(); tabs[next].click(); return;
    }
    if (event.defaultPrevented || event.isComposing || event.repeat || !el.matches('[role="button"][onclick]') || el.matches('button,a,input,select,textarea')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (el.getAttribute('aria-disabled') !== 'true') el.click();
    }
  });
  var toast = document.getElementById('toast');
  if (toast) { toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite'); toast.setAttribute('aria-atomic','true'); }
  document.querySelectorAll('.msg,.statusline,#status').forEach(function (el) { el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); });
  var overlay = document.getElementById('overlay');
  if (overlay) { overlay.setAttribute('role','status'); overlay.setAttribute('aria-label','처리 중입니다. 잠시만 기다려주세요.'); }
  var main = document.querySelector('main,.wrap,.panel.active');
  if (main) {
    var skip = document.createElement('a');
    if (!main.id) main.id = 'kcl-main-content';
    skip.className = 'kcl-skip-link'; skip.href = '#' + main.id; skip.textContent = '본문으로 이동';
    skip.addEventListener('click', function (event) {
      event.preventDefault();
      var target = document.querySelector('.eval-wrap.active,.panel.active') || main;
      target.setAttribute('tabindex','-1'); target.focus();
    });
    document.body.prepend(skip);
  }
})();
