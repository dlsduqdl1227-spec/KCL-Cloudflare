(function () {
  "use strict";

  var ACTION_BY_FN = {
    getConfig: "getConfig",
    judgeLogin: "loginOperator",
    getParticipantAssignments: "getParticipantAssignments",
    submitScores: "saveScore",
    submitWithSignature: "saveScore",
    sendOTP: "loginParticipant",
    verifyOTP: "getDebriefing",
    getRanking: "getRanking",
    getRankingDetail: "getRankingDetail",
    getReviewList: "getReviewList",
    updateReviewStatusBatch: "updateReviewStatusBatch",
    updateReviewStatus: "updateReviewStatus",
    updateReviewRow: "updateReviewRow",
    deleteReviewRow: "deleteReviewRow",
    saveIkrcSeedToCupMatch: "saveIkrcSeedToCupMatch",
    updateIkrcSeedToCupResult: "updateIkrcSeedToCupResult",
    getIkrcSeedToCupConsole: "getIkrcSeedToCupConsole",
    getMobCalibrationParticipantNumbers: "getMobCalibrationParticipantNumbers",
    markMobCalibrationChecked: "markMobCalibrationChecked",
    getMobCalibrationResultsByParticipant: "getMobCalibrationResultsByParticipant",
    getIkrcCalibrationCupNumbers: "getIkrcCalibrationCupNumbers",
    markIkrcCalibrationChecked: "markIkrcCalibrationChecked",
    getIkrcCalibrationResultsByCup: "getIkrcCalibrationResultsByCup",
    createRankingDetailPdf: "createRankingDetailPdf",
    createDebriefPdfFromPayload: "createDebriefPdfFromPayload",
    updateCompetitionAdminSettings: "updateCompetitionAdminSettings",
    upsertOperatorAccount: "upsertOperatorAccount",
    deleteOperatorAccount: "deleteOperatorAccount",
    cleanupCompetitionSheetTabs: "cleanupCompetitionSheetTabs",
    getAdminConsoleData: "getAdminConsoleData"
  };

  function payloadFor(fn, args) {
    args = args || [];
    if (fn === "judgeLogin") return { name: args[0], phone: args[1] };
    if (fn === "getParticipantAssignments") return { competitionCode: args[0], auth: args[1] || {} };
    if (fn === "submitScores" || fn === "submitWithSignature") return args[0] || {};
    if (fn === "sendOTP") return { name: args[0], phone: args[1], competitionCode: args[2] };
    if (fn === "verifyOTP") return { name: args[0], phone: args[1], competitionCode: args[2], otp: args[3] };
    if (fn === "getRanking") return { competitionCode: args[0], round: args[1], auth: args[2] || {} };
    if (fn === "getRankingDetail") return { competitionCode: args[0], round: args[1], unit: args[2], auth: args[3] || {} };
    if (fn === "getReviewList") return { competitionCode: args[0], round: args[1], auth: args[2] || {} };
    return { args: args };
  }

  function normalizeResult(data) {
    if (data && typeof data === "object" && "result" in data && Object.keys(data).length <= 3) {
      return data.result;
    }
    return data;
  }

  function postGas(fn, args, timeoutMs) {
    var action = ACTION_BY_FN[fn] || fn;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
    return fetch("/api/gas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: action,
        fn: fn,
        args: args || [],
        payload: payloadFor(fn, args || [])
      }),
      signal: controller.signal
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = text ? JSON.parse(text) : {};
        if (!res.ok || (data && data.success === false)) {
          var err = new Error((data && data.message) || ("HTTP " + res.status));
          err.response = data;
          throw err;
        }
        return normalizeResult(data);
      });
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function postAction(action, payload, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
    return fetch("/api/gas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: action,
        payload: payload || {}
      }),
      signal: controller.signal
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = text ? JSON.parse(text) : {};
        if (!res.ok || (data && data.success === false)) {
          var err = new Error((data && data.message) || ("HTTP " + res.status));
          err.response = data;
          throw err;
        }
        return normalizeResult(data);
      });
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function createRunner(successHandler, failureHandler) {
    var state = {
      successHandler: successHandler || function () {},
      failureHandler: failureHandler || function (err) { console.error(err); },
      timeoutMs: 30000
    };
    var target = {
      withSuccessHandler: function (fn) {
        return createRunner(fn, state.failureHandler);
      },
      withFailureHandler: function (fn) {
        return createRunner(state.successHandler, fn);
      },
      withTimeout: function (ms) {
        state.timeoutMs = ms || 30000;
        return proxy;
      }
    };
    var proxy = new Proxy(target, {
      get: function (obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop !== "string") return obj[prop];
        return function () {
          var args = Array.prototype.slice.call(arguments);
          postGas(prop, args, state.timeoutMs)
            .then(function (result) { state.successHandler(result); })
            .catch(function (err) { state.failureHandler(err); });
          return proxy;
        };
      }
    });
    return proxy;
  }

  window.kclRpc = {
    call: postGas,
    callAction: postAction
  };
  window.google = {
    script: {
      run: createRunner()
    }
  };
})();
