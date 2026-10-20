/* Presentation-only picker. Every change goes through the original tag control. */
(function () {
  'use strict';
  var sectionSelector = '.smart-tags-section,.mob-attr-tools';
  var optionSelector = '.cat-btn-p,.cat-btn-s,.cat-btn-t';
  var active = null, dialog, search, categories, choices, selected, status, custom, frame = 0;
  function text(el) {
    if (!el) return '';
    var ko = el.querySelector('.kcr-tag-ko'), en = el.querySelector('.kcr-tag-en');
    return (ko ? ko.textContent + (en ? ' · ' + en.textContent : '') : el.textContent).replace(/\s+/g, ' ').trim();
  }
  function chipText(el) {
    var ko = el.classList.contains('kcr-selected-tag') && el.querySelector('span');
    return ko ? ko.textContent.trim() + ' ×' : text(el);
  }
  function button(label, action, className) {
    var el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.className = className || '';
    el.addEventListener('click', action);
    return el;
  }
  function context(root) {
    var view = root.closest('.eval-wrap,.review-wrap');
    var review = root.classList.contains('review-smart-tags');
    var key = (view ? view.id : '') + '|' + (window._selComp?.code || '') + '|' +
      (window._selComp?.currentRound || '') + '|' + (window._judge?.judgeToken || '');
    var owner;
    if (review) {
      owner = window._reviewState?.current;
      key += '|' + window._reviewState?.code + '|' + owner?.rowIndex;
    } else if (root.closest('#evalCupping')) owner = window._cupping?.cups[window._cupping.currentIdx];
    else if (root.closest('#evalIkrc')) owner = window._ikrcSamples?.[window._ikrcIdx];
    else if (root.closest('#evalKcac')) {
      owner = window._kcac?.jars[window._kcac.currentIdx];
      key += '|' + document.getElementById('kcac-num')?.value + '|' + owner?.patternType;
    } else if (root.closest('#evalKbc')) key += '|' + window._kbcClientSubmissionId + '|' + document.getElementById('kbc-num')?.value;
    else if (root.closest('#evalMob')) key += '|' + window._mobClientSubmissionId + '|' + document.getElementById('mob-num')?.value;
    return {key:key, owner:owner};
  }
  function source() {
    var anchor = active && document.getElementById(active.id);
    var root = anchor && anchor.closest(sectionSelector);
    if (!root || !root.getClientRects().length) return null;
    var current = context(root);
    if (active.context && (active.context.key !== current.key || active.context.owner !== current.owner)) return null;
    return root;
  }
  function isDisabled(el) { return el.disabled || el.classList.contains('disabled') || !el.getAttribute('onclick'); }
  function option(el) {
    return el.matches(optionSelector) && !el.classList.contains('smart-tag-nav-only') &&
      !el.classList.contains('kcl-tag-launch') &&
      !(el.classList.contains('kcr-tag-family-btn') && /,''\)$/.test(el.getAttribute('onclick') || ''));
  }
  function model(root) {
    var groups = [], seen = new Set();
    function add(label, nodes) {
      var entries = Array.from(nodes).filter(function (el) { return option(el) && !seen.has(el); });
      entries.forEach(function (el) { seen.add(el); });
      if (entries.length) groups.push({label:label || '특성', entries:entries});
    }
    var refs = root.querySelector('.kcr-aftertaste-flavor-list');
    if (refs) add('남아 있는 플레이버', refs.querySelectorAll(optionSelector));
    var primary = root.querySelector('.category-primary');
    var parents = primary ? Array.from(primary.querySelectorAll('.cat-btn-p')) : [];
    var panels = Array.from(root.querySelectorAll('.kcr-tag-options,.category-secondary'));
    if (parents.length && panels.length === parents.length) {
      parents.forEach(function (parent, i) {
        add(text(parent.querySelector('.kcr-tag-ko')) || text(parent),
          [parent].concat(Array.from(panels[i].querySelectorAll(optionSelector))));
      });
    } else {
      root.querySelectorAll('.kcac-smart-group').forEach(function (group) {
        add(text(group.querySelector('.kcac-smart-group-label')), group.querySelectorAll(optionSelector));
      });
    }
    add('특성', root.querySelectorAll(optionSelector));
    return groups;
  }
  function selectionNodes(root) { return Array.from(root.querySelectorAll('.selected-tags .selected-tag')); }
  function selectionCount(root) { return selectionNodes(root).length; }
  function titleFor(root) {
    var card = root.closest('.attr-card,.score-row,.kcac-attr-card,.review-eval-group');
    var title = card && card.querySelector('h3,.score-row-name,.score-row-title,.kcac-attr-name,.section-label');
    return text(title) || text(root.querySelector('.mob-attr-tag-head span,.smart-tags-title')) || 'Smart Tags';
  }
  function enhance(root) {
    var anchor = root.querySelector('.selected-tags[id]');
    if (!anchor || !root.querySelector(optionSelector)) return;
    var launch = root.querySelector('.kcl-tag-launch');
    if (!launch) {
      var bar = document.createElement('div'); bar.className = 'kcl-tag-toolbar';
      launch = button('', function () { open(anchor.id); }, 'kcl-tag-launch');
      var fallback = button('목록 펼치기', function () {
        var expanded = root.classList.toggle('kcl-tags-expanded');
        fallback.textContent = expanded ? '목록 접기' : '목록 펼치기';
        fallback.setAttribute('aria-expanded', String(expanded));
      }, 'kcl-tag-fallback');
      fallback.setAttribute('aria-expanded', 'false');
      bar.append(launch, fallback);
      root.insertBefore(bar, anchor);
      root.classList.add('kcl-quick-tags');
    }
    var label = '태그 선택 · ' + selectionCount(root) + '개';
    if (launch.textContent !== label) launch.textContent = label;
    launch.setAttribute('aria-haspopup', 'dialog');
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      document.querySelectorAll(sectionSelector).forEach(enhance);
      if (active && !source()) close();
    });
  }
  function createDialog() {
    dialog = document.createElement('dialog'); dialog.id = 'kcl-smart-tag-picker';
    dialog.setAttribute('aria-labelledby', 'kcl-tag-picker-title');
    dialog.setAttribute('aria-describedby', 'kcl-tag-picker-context');
    dialog.innerHTML = '<div class="kcl-tag-picker-head"><div><strong id="kcl-tag-picker-title">Smart Tags</strong><div id="kcl-tag-picker-context" class="kcl-tag-picker-context"></div></div></div>' +
      '<div class="kcl-tag-picker-search"><label for="kcl-tag-search">태그 검색</label><input id="kcl-tag-search" type="search" placeholder="표현 또는 계열 검색" autocomplete="off"></div>' +
      '<div class="kcl-tag-picker-selected" aria-label="선택한 태그"></div>' +
      '<div class="kcl-tag-picker-body"><nav class="kcl-tag-picker-categories" aria-label="태그 분류"></nav><div class="kcl-tag-picker-choices" role="group" aria-label="선택 가능한 태그"></div></div>' +
      '<div class="kcl-tag-picker-custom"></div><div class="kcl-tag-picker-status" role="status" aria-live="polite"></div><footer></footer>';
    dialog.querySelector('.kcl-tag-picker-head').append(button('닫기', close, 'kcl-tag-picker-close'));
    dialog.querySelector('footer').append(button('선택한 태그 확인', close, 'kcl-tag-picker-done'));
    search = dialog.querySelector('input'); categories = dialog.querySelector('nav');
    choices = dialog.querySelector('.kcl-tag-picker-choices'); selected = dialog.querySelector('.kcl-tag-picker-selected');
    status = dialog.querySelector('.kcl-tag-picker-status'); custom = dialog.querySelector('.kcl-tag-picker-custom');
    search.addEventListener('input', render);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
    document.body.append(dialog);
  }
  function fitViewport() {
    if (!dialog) return;
    var viewport = window.visualViewport, height = viewport ? viewport.height : window.innerHeight;
    dialog.style.setProperty('--kcl-tag-viewport-height', height + 'px');
    dialog.style.top = ((viewport ? viewport.offsetTop : 0) + Math.max(6, (height - 740) / 2)) + 'px';
    dialog.classList.toggle('kcl-tag-short', height < 420);
  }
  function open(id) {
    if (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) {
      var anchor = document.getElementById(id), root = anchor && anchor.closest(sectionSelector);
      if (root) { root.classList.add('kcl-tags-expanded'); root.querySelector('.kcl-tag-fallback').setAttribute('aria-expanded','true'); }
      return;
    }
    if (!dialog) createDialog();
    active = {id:id, group:'', returnFocus:document.activeElement};
    search.value = ''; status.textContent = '';
    var root = source();
    if (!root) { active = null; return; }
    active.context = context(root);
    var view = root.closest('#evalCupping,#evalIkrc,#evalKcac');
    var cup = view && view.querySelector('#cupping-current-number,#ikrc-current-number,#kcac-current-number,#ikrc-sample-label,#kcac-cup-title');
    var limit = text(root.querySelector('.smart-tags-hint')).match(/(?:최대\s*\d+개|\/\s*\d+개)/);
    dialog.querySelector('.kcl-tag-picker-context').textContent =
      [text(cup), titleFor(root), limit ? limit[0].replace(/^\/\s*/, '최대 ') : ''].filter(Boolean).join(' · ');
    custom.replaceChildren();
    var originalInput = root.querySelector('.custom-tag-row input');
    var originalAdd = root.querySelector('.custom-tag-row button');
    if (originalInput && originalAdd) {
      var input = document.createElement('input'); input.type = 'text'; input.placeholder = '직접 입력';
      input.setAttribute('aria-label', '스마트태그 직접 입력'); input.value = originalInput.value;
      input.disabled = originalInput.disabled;
      input.addEventListener('input', function () {
        var field = source()?.querySelector('.custom-tag-row input');
        if (field) field.value = input.value;
      });
      var add = button('추가', function () {
        var current = source(), field = current && current.querySelector('.custom-tag-row input');
        var trigger = current && current.querySelector('.custom-tag-row button');
        if (!field || !trigger || trigger.disabled) return;
        field.value = input.value; trigger.click(); input.value = field.value; render(); schedule();
      });
      add.disabled = originalAdd.disabled;
      input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); add.click(); } });
      custom.append(input, add);
    }
    render(); fitViewport(); dialog.showModal();
    // Do not summon the mobile keyboard until the judge intentionally searches.
    dialog.querySelector('.kcl-tag-picker-close').focus({preventScroll:true});
  }
  function close() {
    var root = source(), focus = root && root.querySelector('.kcl-tag-launch');
    active = null;
    if (dialog && dialog.open) dialog.close();
    if (focus) focus.focus({preventScroll:true});
  }
  function activate(el) {
    var root = source();
    if (!root) { close(); return; }
    if (!el || !el.isConnected || !root.contains(el) || isDisabled(el)) return;
    var before = selectionNodes(root).map(text).join('|');
    var priorToast = text(document.getElementById('toast'));
    el.click(); // Original validation, max count, conflicts, autosave and per-cup isolation.
    root = source();
    if (!root) { close(); return; }
    var after = selectionNodes(root).map(text).join('|');
    var nextToast = text(document.getElementById('toast'));
    status.textContent = before === after
      ? (nextToast && nextToast !== priorToast ? nextToast : '선택이 바뀌지 않았습니다. 선택 개수와 중복 조건을 확인해주세요.')
      : '선택한 태그 ' + selectionCount(root) + '개';
    render(); schedule();
  }
  function render() {
    var root = source();
    if (!root) { close(); return; }
    var groups = model(root), query = search.value.trim().toLocaleLowerCase();
    if (!groups.some(function (group) { return group.label === active.group; })) active.group = groups[0] ? groups[0].label : '';
    var scroll = choices.scrollTop, oldFocus = document.activeElement;
    var focusedAction = oldFocus && oldFocus.getAttribute('data-source-action');
    var focusedType = oldFocus?.classList.contains('kcl-tag-picker-option') ? '.kcl-tag-picker-option' : '.kcl-tag-picker-chip';
    selected.replaceChildren();
    selectionNodes(root).forEach(function (el) {
      var chip = button(chipText(el), function () { activate(el); }, 'kcl-tag-picker-chip');
      chip.disabled = isDisabled(el); chip.setAttribute('aria-label', chipText(el).replace(/\s*×$/, '') + ' 선택 해제');
      chip.setAttribute('data-source-action', el.getAttribute('onclick') || '');
      selected.append(chip);
    });
    if (!selected.childElementCount) selected.textContent = '선택한 태그 없음';
    categories.replaceChildren(); choices.replaceChildren();
    groups.forEach(function (group) {
      var count = group.entries.filter(function (el) { return el.classList.contains('selected'); }).length;
      var tab = button(group.label + (count ? ' · ' + count : ''), function () {
        active.group = group.label; search.value = ''; choices.scrollTop = 0; render();
        Array.from(categories.children).find(function (item) { return item.getAttribute('aria-pressed') === 'true'; })?.focus({preventScroll:true});
      });
      tab.setAttribute('aria-pressed', String(group.label === active.group && !query)); categories.append(tab);
      var matches = group.entries.filter(function (el) { return !query || (text(el) + ' ' + group.label).toLocaleLowerCase().includes(query); });
      if ((!query && group.label !== active.group) || !matches.length) return;
      var heading = document.createElement('h3'); heading.textContent = group.label; choices.append(heading);
      var grid = document.createElement('div'); grid.className = 'kcl-tag-picker-grid';
      matches.forEach(function (el) {
        var item = button(text(el), function () { activate(el); }, 'kcl-tag-picker-option');
        var ko = el.querySelector('.kcr-tag-ko'), en = el.querySelector('.kcr-tag-en');
        if (ko) {
          item.textContent = '';
          var name = document.createElement('span'); name.textContent = ko.textContent; item.append(name);
          if (en) { var secondary = document.createElement('small'); secondary.textContent = en.textContent; item.append(secondary); }
        }
        item.disabled = isDisabled(el); item.setAttribute('aria-pressed', String(el.classList.contains('selected')));
        item.setAttribute('data-source-action', el.getAttribute('onclick') || '');
        if (/보완|개선|부정/.test(group.label)) item.classList.add('refinement');
        else if (/긍정/.test(group.label)) item.classList.add('positive');
        grid.append(item);
      });
      choices.append(grid);
    });
    if (!choices.childElementCount) { var empty = document.createElement('p'); empty.textContent = '일치하는 태그가 없습니다.'; choices.append(empty); }
    choices.scrollTop = scroll;
    if (focusedAction) Array.from(dialog.querySelectorAll(focusedType)).find(function (el) { return el.getAttribute('data-source-action') === focusedAction; })?.focus({preventScroll:true});
    var done = dialog.querySelector('.kcl-tag-picker-done');
    done.textContent = selectionCount(root) + '개 선택 · 확인';
  }
  function start() {
    schedule();
    new MutationObserver(function (mutations) {
      if (active && !source()) close();
      if (mutations.some(function (mutation) {
        return !dialog?.contains(mutation.target) && !mutation.target.closest?.('.kcl-tag-toolbar') &&
          (mutation.target.closest?.(sectionSelector) || Array.from(mutation.addedNodes).some(function (node) {
            return node.nodeType === 1 && (node.matches(sectionSelector) || node.querySelector(sectionSelector));
          }));
      })) schedule();
    }).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
    // A native/browser back must never leave a picker editing a hidden screen.
    window.addEventListener('popstate', close, {capture:true});
    window.addEventListener('resize', function () { if (active) fitViewport(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { if (active) fitViewport(); });
      window.visualViewport.addEventListener('scroll', function () { if (active) fitViewport(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
