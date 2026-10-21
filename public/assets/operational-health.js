/* Admin-only, read-only diagnostics. Never read or write an evaluation draft. */
var _healthLoading = false;
var _healthLast = null;
var _healthRefreshTimer = null;
function healthNumber_(value) { return new Intl.NumberFormat('ko-KR').format(Math.max(0,Number(value)||0)); }
function healthTimeText_(value) {
  if (!value) return '-';
  var date = new Date(value);
  return isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
}
// Display thresholds, not Cloudflare limits or a guarantee of current availability.
// CPU time measures execution work, not response latency; do not invent a CPU limit.
function operationalHealthSignal_(res, loading, now) {
  var signal = function(tone,label,description){return {tone:tone,label:label,description:description};};
  if (!res && loading) return signal('unknown','확인 중','최근 서버 상태를 확인하고 있습니다.');
  if (res && res.state === 'no_data') return signal('unknown','집계 대기','최근 요청 집계가 없어 아직 상태를 판단할 수 없습니다.');
  if (!res || !res.success || !res.available) return signal('unknown','확인 불가',(res && res.message) || '상태 조회에 연결하지 못했습니다. 서버 장애로 확정된 것은 아닙니다.');
  var valid = function(value){return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;};
  if (!valid(res.requests) || Number(res.requests) <= 0 || !valid(res.errors) || !valid(res.resourceErrors)) return signal('unknown','확인 불가','집계 수치가 충분하지 않아 상태를 판단할 수 없습니다.');
  var checked = Date.parse(res.updatedAt), current = now == null ? Date.now() : now;
  if (res.stale || res.state === 'stale' || !Number.isFinite(checked) || current - checked > 5*60000 || checked - current > 60000) return signal('warning','주의','최신 상태를 확인하지 못했습니다. 상세 수치는 마지막 확인 자료입니다.');
  if (Number(res.resourceErrors) > 0) return signal('error','오류','최근 집계에서 서버 자원 한도 초과 오류가 감지됐습니다. 운영 담당자의 확인이 필요합니다.');
  if (Number(res.errors) / Number(res.requests) >= .05 || res.state === 'error') return signal('error','오류','최근 집계에서 실행 오류가 많이 감지됐습니다. 운영 담당자의 확인이 필요합니다.');
  if (Number(res.errors) > 0 || res.state === 'warning') return signal('warning','주의','최근 일부 요청에서 실행 오류가 감지됐습니다. 같은 문제가 반복되는지 확인해 주세요.');
  return signal('ok','정상','최근 집계에서 실행 오류가 감지되지 않았습니다.');
}
function renderOperationalHealth_(res) {
  var body = document.getElementById('server-health-body');
  var refresh = document.getElementById('server-health-refresh');
  if (refresh) { refresh.disabled = _healthLoading; refresh.textContent = _healthLoading ? '확인 중…' : '새로고침'; }
  if (!body) return;
  var signal = operationalHealthSignal_(res,_healthLoading);
  var detailsOpen = !!body.querySelector('details[open]');
  var summaryFocused = body.contains(document.activeElement) && document.activeElement.tagName === 'SUMMARY';
  function card(label,value,detail,warn) {
    return '<div class="d1-usage-metric '+(warn?'warning':'')+'"><div class="d1-usage-label">'+escHtml(label)+'</div>'+
      '<div class="d1-usage-value">'+escHtml(value)+'</div><div class="d1-usage-detail">'+escHtml(detail)+'</div></div>';
  }
  var cpu = function(n){ return n == null || !Number.isFinite(Number(n)) ? '집계 없음' : Number(n).toFixed(2)+' ms'; };
  body.className = 'server-health-body';
  body.innerHTML = '<div class="server-health-signal" data-state="'+signal.tone+'">'+
    '<span class="server-health-lamp" aria-hidden="true"></span><div class="server-health-copy">'+
    '<strong class="server-health-label">'+escHtml(signal.label)+'</strong><p>'+escHtml(signal.description)+'</p></div></div>'+
    '<div class="server-health-legend" aria-label="상태 색상 안내"><span data-state="ok">초록 · 정상</span><span data-state="warning">주황 · 주의</span><span data-state="error">빨강 · 오류</span></div>';
  if (!res || !res.success || !res.available || signal.tone === 'unknown') return;
  body.innerHTML += '<div class="server-health-updated">마지막 확인 '+escHtml(healthTimeText_(res.updatedAt))+' · 한국시간</div>'+
    '<details class="server-health-details"'+(detailsOpen?' open':'')+'><summary>상세 수치 보기</summary><div class="d1-usage-grid">'+
    card('요청 수',healthNumber_(res.requests)+'건','최근 15분 · KCL만 집계',false)+
    card('실행 오류',healthNumber_(res.errors)+'건',(Number(res.errors)/Number(res.requests)*100).toFixed(2)+'% · 자원 한도 초과 '+healthNumber_(res.resourceErrors)+'건',res.errors>0||res.resourceErrors>0)+
    card('CPU 처리시간 · 중앙값',cpu(res.cpuP50Ms),'실행 50%가 이 시간 이하',false)+
    card('CPU 처리시간 · P99',cpu(res.cpuP99Ms),'실행 99%가 이 시간 이하',false)+'</div>'+
    '<div class="d1-usage-detail">집계 '+escHtml(healthTimeText_(res.windowStart))+' ~ '+escHtml(healthTimeText_(res.windowEnd))+' (한국시간)</div>'+
    '<p class="server-health-rules">표시 기준: 실행 오류 없음은 정상, 일부 오류는 주의, 오류 비율 5% 이상 또는 자원 한도 초과는 오류입니다. 최신 집계를 확인하지 못하면 정상으로 표시하지 않습니다. CPU 시간은 응답 대기시간이나 잔여 용량이 아니며, 이 수치만으로 오류를 판단하지 않습니다.</p></details>';
  if (summaryFocused) body.querySelector('summary').focus({preventScroll:true});
}
function loadOperationalHealth_() {
  if (!isAdminRole() || _healthLoading || document.hidden || activePanelId_()!=='pAdmin' ||
      !document.getElementById('admin-section-run').classList.contains('active')) return;
  if (_healthLast && Date.now()<_healthLast.nextCheckAt) { renderOperationalHealth_(_healthLast); return; }
  _healthLoading = true;
  renderOperationalHealth_(_healthLast);
  google.script.run.withSuccessHandler(function(res){
    _healthLoading = false;
    _healthLast = res || {success:false,message:'서버 상태 응답을 확인하지 못했습니다.',nextCheckAt:Date.now()+300000};
    renderOperationalHealth_(_healthLast);
  }).withFailureHandler(function(){
    _healthLoading = false;
    _healthLast = _healthLast && _healthLast.available
      ? Object.assign({},_healthLast,{stale:true,state:'stale',message:'연결 실패 · 마지막 확인 수치입니다.',nextCheckAt:Date.now()+300000})
      : {success:false,message:'서버 상태 조회 연결을 확인해주세요. 5분 후 다시 시도합니다.',nextCheckAt:Date.now()+300000};
    renderOperationalHealth_(_healthLast);
  }).getOperationalHealth(adminActorPayload_());
}
