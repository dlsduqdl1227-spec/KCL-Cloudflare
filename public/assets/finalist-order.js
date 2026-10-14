(function(){
 'use strict';
 var box=document.getElementById('finalistOrder');if(!box)return;
 var round=document.getElementById('finalistOrderRound'),load=document.getElementById('finalistOrderLoad'),save=document.getElementById('finalistOrderSave'),rows=document.getElementById('finalistOrderRows'),status=document.getElementById('finalistOrderStatus');
 var state={code:'',round:'',data:null,dirty:false,saving:false,saved:false,request:0};
 function code(){return String(document.getElementById('comp').value||'').toUpperCase();}
 function tell(text,error){status.textContent=text;status.className='msg'+(error?' err':'');}
 function reset(){
  state.code=code();state.data=null;state.dirty=false;state.saved=false;state.request++;rows.innerHTML='';save.disabled=true;load.disabled=false;
  round.innerHTML=['MOC','KBC'].includes(state.code)?'<option value="본선">본선 경기</option><option value="결선">최종 결승</option>':'<option value="결선">결선</option>';
  state.round=round.value;tell('');
 }
 function render(){
  var people=state.data.participants;
  rows.innerHTML=people.map(function(p,i){return '<li><label>경연순서<input type="number" min="1" max="'+people.length+'" step="1" value="'+(i+1)+'" data-order-id="'+Number(p.participantId)+'" aria-label="'+esc(p.name)+' 경연순서"></label><div><strong>'+esc(p.name)+'</strong><span>참가번호 '+esc(p.number)+(p.affiliation?' · '+esc(p.affiliation):'')+'</span><span>'+(p.date?esc(p.date):'일정 미정')+'</span></div></li>';}).join('');
  save.disabled=!state.dirty||state.saving;
 }
 function fetchOrder(){
  if(state.saving)return;
  if(state.dirty&&!confirm('저장하지 않은 순서 변경을 취소하고 다시 불러올까요?'))return;
  if(state.code!==code())reset();
  state.round=round.value;state.data=null;state.dirty=false;rows.innerHTML='';save.disabled=true;
  var token=++state.request;load.disabled=true;tell('진출자 명단을 불러오는 중입니다.');
  function current(){return token===state.request&&state.code===code()&&state.round===round.value;}
  rpc('getParticipantRoundOrder',[{competitionCode:state.code,round:state.round},actor],function(res){
   if(!current())return;load.disabled=false;
   if(!res||!res.success){tell(res&&res.message||'불러오지 못했습니다. 다시 시도해주세요.',true);return;}
   state.data=res;render();tell(res.participants.length?(state.saved?'경연순서 저장 완료 · '+res.participants.length+'명·팀':res.participants.length+'명·팀 · 순서 변경 후 저장해주세요.'):'이 회차에 배정된 진출자가 없습니다.');state.saved=false;
  },function(){if(current()){load.disabled=false;tell('서버 연결을 확인한 뒤 다시 불러와주세요.',true);}});
 }
 box.addEventListener('toggle',function(){if(box.open&&(!state.data||state.code!==code())){if(state.code!==code())reset();fetchOrder();}});
 load.addEventListener('click',fetchOrder);
 round.addEventListener('change',function(){
  if(state.saving){round.value=state.round;return;}
  if(state.dirty&&!confirm('저장하지 않은 순서 변경을 취소하고 회차를 바꿀까요?')){round.value=state.round;return;}
  state.dirty=false;fetchOrder();
 });
 document.getElementById('comp').addEventListener('change',function(event){
  if(state.saving||state.dirty&&!confirm('저장하지 않은 경연순서 변경을 취소하고 대회를 바꿀까요?')){event.stopImmediatePropagation();event.target.value=state.code;return;}
  reset();if(box.open)fetchOrder();
 },true);
 rows.addEventListener('change',function(event){
  var input=event.target.closest('[data-order-id]');if(!input||!state.data||state.saving)return;
  var people=state.data.participants,from=people.findIndex(function(p){return p.participantId===Number(input.dataset.orderId);}),to=Number(input.value)-1;
  if(!Number.isInteger(to)||to<0||to>=people.length){tell('1~'+people.length+' 사이의 순서를 입력해주세요.',true);render();return;}
  if(from===to)return;var moved=people.splice(from,1)[0];people.splice(to,0,moved);state.dirty=true;render();tell('순서가 변경되었습니다. 경연순서 저장을 눌러 반영하세요.');
 });
 save.addEventListener('click',function(){
  if(!state.data||!state.dirty||state.saving)return;
  if(!confirm(state.code+' '+(state.round==='본선'?'본선 경기':'결선')+' 경연순서를 저장할까요?\n참가번호와 기존 평가 기록은 바뀌지 않습니다.'))return;
  state.saving=true;save.disabled=true;load.disabled=true;round.disabled=true;rows.querySelectorAll('input').forEach(function(e){e.disabled=true;});tell('경연순서를 저장하는 중입니다.');
  function release(){state.saving=false;load.disabled=false;round.disabled=false;rows.querySelectorAll('input').forEach(function(e){e.disabled=false;});save.disabled=!state.dirty;}
  rpc('saveParticipantRoundOrder',[{competitionCode:state.code,round:state.round,revision:state.data.revision,participantIds:state.data.participants.map(function(p){return p.participantId;})},actor],function(res){
   release();if(!res||!res.success){tell(res&&res.message||'저장하지 못했습니다. 변경 내용은 유지했습니다.',true);return;}
   state.dirty=false;state.saved=true;save.disabled=true;fetchOrder();if(typeof loadParticipants==='function')loadParticipants();
  },function(){release();tell('저장 확인이 지연됩니다. 변경 내용은 유지했습니다. 새로고침으로 저장 결과를 확인해주세요.',true);});
 });
})();
