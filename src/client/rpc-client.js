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

  function readJsonResponse(res) {
    return res.text().then(function (text) {
      var data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { success: false, message: text ? text.slice(0, 300) : "" };
      }
      if (!res.ok || (data && data.success === false)) {
        var err = new Error((data && data.message) || ("HTTP " + res.status));
        err.status = res.status;
        err.response = data;
        throw err;
      }
      return normalizeResult(data);
    });
  }

  function postJson(url, body, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    }).then(readJsonResponse).finally(function () {
      clearTimeout(timer);
    });
  }

  function shouldFallbackToRpc(err) {
    var msg = String((err && err.message) || "");
    var status = Number(err && err.status);
    return status === 404 || status === 405 || /GAS_WEBAPP_URL|GAS_SHARED_SECRET|Method not allowed|HTTP 405/i.test(msg);
  }

  function compactKey(value) {
    return String(value || "").replace(/[\s_\-./\\()[\]:]/g, "").toLowerCase();
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizePhoneDigits(value) {
    return normalizeText(value).replace(/[^0-9]/g, "");
  }

  function phoneMatches(inputPhone, rowPhone) {
    var input = normalizePhoneDigits(inputPhone);
    var row = normalizePhoneDigits(rowPhone);
    if (!input || !row) return false;
    if (input === row) return true;
    if (input.replace(/^0+/, "") === row.replace(/^0+/, "")) return true;
    if (row.length <= 4 && input.slice(-row.length) === row) return true;
    if (input.length <= 4 && row.slice(-input.length) === input) return true;
    return false;
  }

  function fieldValue(row, aliases) {
    if (!row || !aliases) return "";
    var keys = Object.keys(row);
    for (var i = 0; i < aliases.length; i++) {
      var want = compactKey(aliases[i]);
      for (var j = 0; j < keys.length; j++) {
        if (compactKey(keys[j]) === want) return normalizeText(row[keys[j]]);
      }
    }
    return "";
  }

  function inferAssetType(url) {
    var clean = String(url || "").split("?")[0].toLowerCase();
    if (/\.xlsx?$/.test(clean)) return "xlsx";
    if (/\.json$/.test(clean)) return "json";
    return "csv";
  }

  function staticLoginCandidates() {
    var defaults = [
      "/assets/operators.json",
      "/assets/login.json",
      "/assets/operator_accounts.json",
      "/assets/operators.csv",
      "/assets/login.csv",
      "/assets/operator_accounts.csv",
      "/assets/\uC6B4\uC601\uD0ED.csv",
      "/assets/\uB85C\uADF8\uC778.csv",
      "/assets/\uC6B4\uC601\uC790.csv",
      "/assets/operators.xlsx",
      "/assets/login.xlsx",
      "/assets/operator_accounts.xlsx",
      "/assets/\uC6B4\uC601\uD0ED.xlsx",
      "/assets/\uB85C\uADF8\uC778.xlsx",
      "/assets/\uC6B4\uC601\uC790.xlsx"
    ];
    var configured = window.KCL_STATIC_LOGIN_ASSETS || window.KCL_STATIC_LOGIN_ASSET || [];
    if (typeof configured === "string") configured = [configured];
    if (!Array.isArray(configured)) configured = [];
    var combined = configured.concat(defaults);
    var seen = {};
    return combined.map(function (item) {
      var url = typeof item === "string" ? item : item && item.url;
      if (!url) return null;
      return { url: url, type: (item && item.type) || inferAssetType(url) };
    }).filter(function (item) {
      if (!item || seen[item.url]) return false;
      seen[item.url] = true;
      return true;
    });
  }

  function detectCsvDelimiter(text) {
    var first = String(text || "").split(/\r?\n/).filter(function (line) { return line.trim(); })[0] || "";
    var comma = (first.match(/,/g) || []).length;
    var tab = (first.match(/\t/g) || []).length;
    var semi = (first.match(/;/g) || []).length;
    if (tab > comma && tab >= semi) return "\t";
    if (semi > comma && semi > tab) return ";";
    return ",";
  }

  function parseDelimitedRows(text, delimiter) {
    text = String(text || "").replace(/^\uFEFF/, "");
    delimiter = delimiter || detectCsvDelimiter(text);
    var rawRows = [];
    var row = [];
    var cell = "";
    var quote = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '"') {
        if (quote && text.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else {
          quote = !quote;
        }
      } else if (ch === delimiter && !quote) {
        row.push(cell);
        cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quote) {
        if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cell);
        if (row.some(function (v) { return normalizeText(v); })) rawRows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (v) { return normalizeText(v); })) rawRows.push(row);
    if (!rawRows.length) return [];
    var headers = rawRows.shift().map(function (h) { return normalizeText(h); });
    return rawRows.map(function (values) {
      var obj = {};
      headers.forEach(function (h, idx) {
        if (h) obj[h] = normalizeText(values[idx]);
      });
      return obj;
    });
  }

  var xlsxLoaderPromise = null;
  function loadXlsxScriptFrom(index, sources, resolve, reject) {
    if (index >= sources.length) {
      reject(new Error("XLSX parser load failed"));
      return;
    }
    var script = document.createElement("script");
    script.src = sources[index];
    script.async = true;
    script.onload = function () { window.XLSX ? resolve(window.XLSX) : loadXlsxScriptFrom(index + 1, sources, resolve, reject); };
    script.onerror = function () { loadXlsxScriptFrom(index + 1, sources, resolve, reject); };
    document.head.appendChild(script);
  }

  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLoaderPromise) {
      xlsxLoaderPromise = new Promise(function (resolve, reject) {
        loadXlsxScriptFrom(0, [
          "/client/vendor/xlsx.full.min.js",
          "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        ], resolve, reject);
      });
    }
    return xlsxLoaderPromise;
  }

  function parseXlsxRows(buffer) {
    return ensureXlsx().then(function (XLSX) {
      var workbook = XLSX.read(buffer, { type: "array" });
      var rows = [];
      workbook.SheetNames.forEach(function (sheetName) {
        var sheet = workbook.Sheets[sheetName];
        rows = rows.concat(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
      });
      return rows;
    });
  }

  function fetchStaticRows(candidate) {
    return fetch(candidate.url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        var err = new Error("Static login asset not found");
        err.status = res.status;
        throw err;
      }
      if (candidate.type === "xlsx") return res.arrayBuffer().then(parseXlsxRows);
      return res.text().then(function (text) {
        if (candidate.type === "json") {
          var parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.operators)) return parsed.operators;
          if (parsed && Array.isArray(parsed.accounts)) return parsed.accounts;
          return [];
        }
        return parseDelimitedRows(text);
      });
    });
  }

  function loadStaticLoginRows() {
    var candidates = staticLoginCandidates();
    var lastErr = null;
    function next(index) {
      if (index >= candidates.length) {
        return Promise.reject(lastErr || new Error("No static login asset"));
      }
      return fetchStaticRows(candidates[index]).then(function (rows) {
        if (rows && rows.length) return { rows: rows, assetUrl: candidates[index].url };
        return next(index + 1);
      }).catch(function (err) {
        lastErr = err;
        return next(index + 1);
      });
    }
    return next(0);
  }

  var NAME_FIELDS = ["name", "\uC774\uB984", "\uC131\uBA85", "\uC2EC\uC0AC\uC704\uC6D0\uBA85", "\uC6B4\uC601\uC790\uBA85"];
  var PHONE_FIELDS = ["phone", "mobile", "tel", "\uC5F0\uB77D\uCC98", "\uC804\uD654\uBC88\uD638", "\uD734\uB300\uD3F0", "\uD734\uB300\uC804\uD654", "\uC5F0\uB77D\uCC98\uB4B7\uC790\uB9AC"];
  var TYPE_FIELDS = ["type", "accountType", "account_type", "\uACC4\uC815\uC720\uD615", "\uAD8C\uD55C", "\uAD6C\uBD84"];
  var ROLE_FIELDS = ["role", "\uC5ED\uD560", "\uC9C1\uCC45", "\uC2EC\uC0AC\uC5ED\uD560", "\uB2F4\uB2F9"];
  var ACCESS_FIELDS = ["access", "competition", "competitionCode", "competition_code", "\uB2F4\uB2F9\uB300\uD68C", "\uB300\uD68C", "\uC811\uADFC\uAD8C\uD55C"];
  var TEAM_FIELDS = ["teamGroup", "team_group", "team", "group", "\uD300", "\uADF8\uB8F9", "\uC870", "\uD300\uAD6C\uBD84"];
  var AFFILIATION_FIELDS = ["affiliation", "\uC18C\uC18D", "\uD68C\uC0AC"];
  var COMPETITION_CODES = ["KCR", "KCAC", "MOC", "MOB", "KTCC", "KBC", "IKRC"];

  function normalizeAccountType(value, role) {
    var raw = String(value || "").trim().toUpperCase();
    var text = String(value || "") + " " + String(role || "");
    if (/ADMIN|\uAD00\uB9AC\uC790/i.test(raw) || /\uAD00\uB9AC\uC790/.test(text)) return "ADMIN";
    if (/TEAMLEAD|TEAM_LEAD/i.test(raw) || /\uD300\uC7A5/.test(text)) return "TEAMLEAD";
    return raw || "JUDGE";
  }

  function staticLoginResultFromRow(row, args, assetUrl) {
    var role = fieldValue(row, ROLE_FIELDS);
    var type = normalizeAccountType(fieldValue(row, TYPE_FIELDS), role);
    var roleMap = {};
    var teamMap = {};
    var accessList = [];
    COMPETITION_CODES.forEach(function (code) {
      var codeRole = fieldValue(row, [code, code + " role", code + "_role", code + "\uC5ED\uD560", code + "\uB2F4\uB2F9"]);
      var codeTeam = fieldValue(row, [code + " team", code + "_team", code + "\uD300", code + "\uC870", code + "\uADF8\uB8F9"]);
      if (codeRole) {
        roleMap[code] = codeRole;
        accessList.push(code);
      }
      if (codeTeam) {
        teamMap[code] = codeTeam;
        if (accessList.indexOf(code) < 0) accessList.push(code);
      }
    });
    var access = fieldValue(row, ACCESS_FIELDS) || accessList.join(",");
    if (!access) access = type === "ADMIN" ? "ALL" : "ALL";
    if (!role) role = type === "ADMIN" ? "\uAD00\uB9AC\uC790" : (type === "TEAMLEAD" ? "\uD300\uC7A5" : "\uC2EC\uC0AC\uC704\uC6D0");
    return {
      success: true,
      source: "static-asset",
      assetUrl: assetUrl,
      name: fieldValue(row, NAME_FIELDS) || normalizeText(args[0]),
      phone: normalizePhoneDigits(args[1]),
      affiliation: fieldValue(row, AFFILIATION_FIELDS),
      type: type,
      accountType: type,
      role: role,
      access: access,
      teamGroup: fieldValue(row, TEAM_FIELDS),
      teamMap: teamMap,
      roleMap: roleMap,
      judgeToken: "asset-login:" + btoa(unescape(encodeURIComponent((fieldValue(row, NAME_FIELDS) || normalizeText(args[0])) + ":" + Date.now())))
    };
  }

  function tryStaticJudgeLogin(args) {
    var inputName = normalizeText(args && args[0]);
    var inputNameKey = compactKey(inputName);
    var inputPhone = normalizePhoneDigits(args && args[1]);
    if (!inputName || !inputPhone) return Promise.reject(new Error("Missing static login credentials"));
    return loadStaticLoginRows().then(function (loaded) {
      for (var i = 0; i < loaded.rows.length; i++) {
        var row = loaded.rows[i];
        var rowName = fieldValue(row, NAME_FIELDS);
        var rowPhone = fieldValue(row, PHONE_FIELDS);
        if (compactKey(rowName) === inputNameKey && phoneMatches(inputPhone, rowPhone)) {
          return staticLoginResultFromRow(row, args, loaded.assetUrl);
        }
      }
      throw new Error("Static login account not found");
    });
  }

  function judgeLoginFallback(args, timeoutMs, originalErr) {
    var rpcAttempt = shouldFallbackToRpc(originalErr)
      ? postRpc("judgeLogin", args || [], timeoutMs)
      : Promise.reject(originalErr);
    return rpcAttempt.catch(function (rpcErr) {
      return tryStaticJudgeLogin(args || []).catch(function () {
        if (shouldFallbackToRpc(rpcErr)) {
          rpcErr.message = "Cloudflare API媛 POST ?붿껌??諛쏆? 紐삵빀?덈떎. ?뺤쟻 Pages媛 ?꾨땲??Worker(wrangler.toml ?ы븿)濡?諛고룷?먮뒗吏 ?뺤씤?댁＜?몄슂.";
        }
        throw rpcErr;
      });
    });
  }

  function postRpc(fn, args, timeoutMs) {
    return postJson("/api/rpc", { fn: fn, args: args || [] }, timeoutMs);
  }

  function postGas(fn, args, timeoutMs) {
    var action = ACTION_BY_FN[fn] || fn;
    return postJson("/api/gas", {
      action: action,
      fn: fn,
      args: args || [],
      payload: payloadFor(fn, args || [])
    }, timeoutMs).catch(function (err) {
      if (fn === "judgeLogin") {
        return judgeLoginFallback(args || [], timeoutMs, err);
      }
      if (shouldFallbackToRpc(err)) {
        return postRpc(fn, args || [], timeoutMs).catch(function (rpcErr) {
          if (shouldFallbackToRpc(rpcErr)) {
            rpcErr.message = "Cloudflare API가 POST 요청을 받지 못합니다. 정적 Pages가 아니라 Worker(wrangler.toml 포함)로 배포됐는지 확인해주세요.";
          }
          throw rpcErr;
        });
      }
      throw err;
    });
  }

  function postAction(action, payload, timeoutMs) {
    return postJson("/api/gas", {
        action: action,
        payload: payload || {}
    }, timeoutMs).catch(function (err) {
      if (shouldFallbackToRpc(err)) {
        return postRpc(action, [payload || {}], timeoutMs).catch(function (rpcErr) {
          if (shouldFallbackToRpc(rpcErr)) {
            rpcErr.message = "Cloudflare API가 POST 요청을 받지 못합니다. 정적 Pages가 아니라 Worker(wrangler.toml 포함)로 배포됐는지 확인해주세요.";
          }
          throw rpcErr;
        });
      }
      throw err;
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
    callAction: postAction,
    callRpc: postRpc
  };
  window.google = {
    script: {
      run: createRunner()
    }
  };
})();
