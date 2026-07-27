// KCL Cloudflare API shim
// 기존 프론트엔드의 google.script.run 형태 호출을 Cloudflare Functions fetch 호출로 변환합니다.
(function () {
  if (typeof window === 'undefined') return;
  var API_TIMEOUT_MS = 60000;

  function callRpc(action, args) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ try { controller.abort(); } catch(e){} }, API_TIMEOUT_MS) : null;
    return fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, args: Array.prototype.slice.call(args || []) }),
      signal: controller ? controller.signal : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (txt) {
        var data;
        try { data = txt ? JSON.parse(txt) : {}; }
        catch (e) { throw new Error('API 응답을 해석하지 못했습니다. 새로고침 후 다시 시도해주세요.'); }
        if (!res.ok) {
          if (res.status === 404 || res.status === 405) {
            throw new Error('Cloudflare Pages Functions가 연결되지 않았습니다. public 폴더만 정적 업로드하지 말고, functions 폴더가 포함된 프로젝트 전체를 GitHub/Cloudflare Pages로 배포해주세요. (/api/rpc ' + res.status + ')');
          }
          throw new Error(data && data.message ? data.message : ('HTTP ' + res.status));
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('요청 시간이 초과되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
      }
      if (!navigator.onLine) {
        throw new Error('인터넷 연결이 끊긴 상태입니다. 연결을 확인한 뒤 다시 시도해주세요.');
      }
      throw err;
    });
  }

  function createRunner(successHandler, failureHandler) {
    var runner = {};
    runner.withSuccessHandler = function (fn) { return createRunner(fn, failureHandler); };
    runner.withFailureHandler = function (fn) { return createRunner(successHandler, fn); };
    return new Proxy(runner, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return target[prop];
        return function () {
          var args = arguments;
          callRpc(prop, args)
            .then(function (data) {
              try {
                if ((prop === 'submitScores' || prop === 'submitWithSignature') && data && data.success && typeof window.kclClearActiveEvalDraftAfterSubmit === 'function') {
                  window.kclClearActiveEvalDraftAfterSubmit(args && args[0]);
                }
              } catch(e) {}
              if (typeof successHandler === 'function') successHandler(data);
            })
            .catch(function (err) {
              if (typeof failureHandler === 'function') failureHandler(err);
              else console.error('[KCL API]', prop, err);
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner(null, null);
})();
