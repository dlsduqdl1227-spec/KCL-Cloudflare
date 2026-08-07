// KCL Cloudflare API shim
// 기존 프론트엔드의 google.script.run 형태 호출을 Cloudflare Functions fetch 호출로 변환합니다.
(function () {
  if (typeof window === 'undefined') return;
  var API_TIMEOUT_MS = 60000;
  var API_MAX_ATTEMPTS = 4;

  function isRetrySafeAction_(action) {
    return /^(ping|get|list|load|fetch|search|validate|check|generate)/i.test(String(action || '')) ||
      [
        'submitScores', 'submitWithSignature',
        'updateReviewRow', 'updateReviewStatus', 'updateReviewStatusBatch',
        'markMobCalibrationChecked', 'markIkrcCalibrationChecked',
        'updateCompetitionAdminSettings', 'saveIkrcStationSettings'
      ].indexOf(String(action || '')) >= 0;
  }

  function retryDelay_(attempt) {
    var delays = [0, 350, 900, 1800];
    var delay = delays[Math.min(Math.max(0, Number(attempt) || 0), delays.length - 1)];
    return new Promise(function(resolve){ setTimeout(resolve, delay); });
  }

  function retryableError_(message, originalError) {
    var error = new Error(message);
    error.retryable = true;
    error.originalError = originalError || null;
    return error;
  }

  function callRpcOnce_(action, args, attempt) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ try { controller.abort(); } catch(e){} }, API_TIMEOUT_MS) : null;
    return fetch('/api/rpc?attempt=' + encodeURIComponent(String((Number(attempt) || 0) + 1)) + '&_=' + Date.now(), {
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
        catch (e) {
          var parseError = new Error('서버 연결이 일시적으로 불안정합니다. 입력 내용은 보존되어 있으며 자동으로 다시 연결합니다. (HTTP ' + res.status + ')');
          parseError.retryable = true;
          parseError.httpStatus = res.status;
          throw parseError;
        }
        if (!res.ok) {
          if (res.status === 404 || res.status === 405) {
            throw new Error('Cloudflare Pages Functions가 연결되지 않았습니다. public 폴더만 정적 업로드하지 말고, functions 폴더가 포함된 프로젝트 전체를 GitHub/Cloudflare Pages로 배포해주세요. (/api/rpc ' + res.status + ')');
          }
          var httpError = new Error(data && data.message ? data.message : ('HTTP ' + res.status));
          httpError.retryable = [408, 425, 500, 502, 503, 504].indexOf(res.status) >= 0;
          throw httpError;
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw retryableError_('서버 응답이 지연되고 있습니다. 입력 내용은 보존되어 있으며 자동으로 다시 연결합니다.', err);
      }
      if (!navigator.onLine) {
        throw new Error('인터넷 연결이 끊긴 상태입니다. 연결을 확인한 뒤 다시 시도해주세요.');
      }
      if (err && (err.retryable || err.name === 'TypeError' || /network|fetch|connection/i.test(String(err.message || '')))) {
        err.retryable = true;
      }
      throw err;
    });
  }

  function callRpc(action, args) {
    function run(attempt) {
      return callRpcOnce_(action, args, attempt).catch(function(err){
        if (!(err && err.retryable) || !isRetrySafeAction_(action) || attempt + 1 >= API_MAX_ATTEMPTS) throw err;
        return retryDelay_(attempt + 1).then(function(){ return run(attempt + 1); });
      });
    }
    return run(0);
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
