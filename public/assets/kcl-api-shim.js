// KCL Cloudflare API shim
// 기존 Apps Script 프론트엔드의 google.script.run 호출을 Cloudflare Functions fetch 호출로 변환합니다.
(function () {
  if (typeof window === 'undefined') return;

  function callRpc(action, args) {
    return fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, args: Array.prototype.slice.call(args || []) })
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data;
        try { data = txt ? JSON.parse(txt) : {}; }
        catch (e) { throw new Error('API 응답을 해석하지 못했습니다: ' + txt.slice(0, 240)); }
        if (!res.ok) {
          throw new Error(data && data.message ? data.message : ('HTTP ' + res.status));
        }
        return data;
      });
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
