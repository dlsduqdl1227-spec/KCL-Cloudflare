/* Admin-only, read-only diagnostics. Never read or write an evaluation draft. */
var _healthLoading = false;
var _healthLast = null;
var _healthRefreshTimer = null;
function healthNumber_(value) { return new Intl.NumberFormat('ko-KR').format(Math.max(0,Number(value)||0)); }
function healthTimeText_(value) {
  var date = new Date(value);
  return isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
}
function renderOperationalHealth_(res) {
  var body = document.getElementById('server-health-body');
  var refresh = document.getElementById('server-health-refresh');
  if (refresh) { refresh.disabled = _healthLoading; refresh.textContent = _healthLoading ? '확인 중…' : '새로고침'; }
  if (!body) return;
  if (!res || !res.success || !res.available) {
    body.className = 'd1-usage-status err';
    body.textContent = (res && res.message) || '서버 상태를 확인하지 못했습니다.';
    return;
  }
  function card(label,value,detail,warn) {
    return '<div class="d1-usage-metric '+(warn?'warning':'')+'"><div class="d1-usage-label">'+escHtml(label)+'</div>'+
      '<div class="d1-usage-value">'+escHtml(value)+'</div><div class="d1-usage-detail">'+escHtml(detail)+'</div></div>';
  }
  var cpu = function(n){ return n == null ? '집계 없음' : Number(n).toFixed(2)+' ms'; };
  body.className = 'd1-usage-status';
  body.innerHTML = '<div class="d1-usage-status '+(res.state==='ok'?'ok':'err')+'">'+
    escHtml(res.stale?res.message:(res.state==='warning'?'최근 실행 오류가 있습니다.':'최근 집계에서 실행 오류가 감지되지 않았습니다.'))+'</div>'+
    '<div class="d1-usage-grid">'+
    card('요청 수',healthNumber_(res.requests)+'건','최근 15분 · KCL만 집계',false)+
    card('실행 오류',healthNumber_(res.errors)+'건',Number(res.errorPercent).toFixed(2)+'% · 자원 한도 초과 '+healthNumber_(res.resourceErrors)+'건',res.errors>0||res.resourceErrors>0)+
    card('CPU 처리시간 · 중앙값',cpu(res.cpuP50Ms),'실행 50%가 이 시간 이하',false)+
    card('CPU 처리시간 · P99',cpu(res.cpuP99Ms),'실행 99%가 이 시간 이하',false)+'</div>'+
    '<div class="d1-usage-detail">집계 '+escHtml(healthTimeText_(res.windowStart))+' ~ '+escHtml(healthTimeText_(res.windowEnd))+
    ' · 확인 '+escHtml(healthTimeText_(res.updatedAt))+' (한국시간)</div>';
}
function loadOperationalHealth_() {
  if (!isAdminRole() || _healthLoading || document.hidden || activePanelId_()!=='pAdmin' ||
      !document.getElementById('admin-section-run').classList.contains('active')) return;
  if (_healthLast && Date.now()<_healthLast.nextCheckAt) { renderOperationalHealth_(_healthLast); return; }
  _healthLoading = true;
  renderOperationalHealth_(_healthLast || {success:false,message:'서버 상태를 확인하는 중입니다.'});
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
