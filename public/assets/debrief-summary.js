(function(root){
  'use strict';
  // A display-only digest of the already-authorized report. No network, storage,
  // official scoring, or generated text is ever written back to an evaluation.
  var privateHeader=/token|secret|phone|^signature(?:data|image|saved|url)?$|submitted.?at|created.?at|updated.?at|timestamp|proxy|entered.?by|operator.?identity|judge.?identity|입력자|작성자|대리|대신.?입력|제출.?시간|평가.?날짜|연락처|서명|자동생성상태|(?:comment|코멘트).*(?:state|enabled|edited|touched|source|method|metadata|사용여부|사용상태|생성여부|생성방식|작성방식|생성상태|설정)/i;
  var tagHeader=/Smart\s*Tags?|\bTags?\b|Tag\s*List|스마트\s*태그|태그/i;
  var commentHeader=/Comment|Memo|Feedback|Note|코멘트|메모|심사평|평가\s*의견|총평|종합\s*의견/i;
  var attributeHeader=/Flavor|Aftertaste|Acidity|Body|Sweetness|Mouthfeel|Clean\s*Cup|Aroma|Overall|Balance|Tactile|Professionalism|Taste|Pattern|Surface|Position|Proportion|Symmetry|Definition|Design|Theme|Execution|Cleanliness|Presentation|Station|Ingredient|Form.*Usability|플레이버|애프터|에프터|피니시|산미|바디|스윗니스|단맛|질감|클린컵|향미|오버롤|완성도|균형|품질|위치|비율|선명도|표현|수행|청결|프레젠|전문성/i;
  function text(value){return String(value==null?'':value).trim();}
  function key(value){return text(value).replace(/\s/g,'').toLowerCase();}
  function role(row){return text(row['역할']||row.role||row.Role||row.JudgeRole);}
  function scope(code,row,header){
    if(code==='KCAC'){
      var cup=text(row['패턴종류']||row['Pattern Type'])+' '+text(row['잔용도']||row['컵용도']||row['평가용도']);
      if(/fast|패스트/i.test(cup))return 'FAST Rosetta';
      if(/slow|슬로우/i.test(cup))return 'SLOW Rosetta';
      if(/센서리|sensory/i.test(cup)||/Taste\s*Balance|Mouthfeel|Presentation|맛의\s*균형|질감|프레젠/i.test(header))return '센서리';
      return '패턴디자인·테크니컬';
    }
    if(code==='KBC'){
      if(/Espresso|에스프레소/i.test(header))return '에스프레소';
      if(/Signature|창작메뉴/i.test(header))return '시그니처';
      return '서비스·기물 운용 및 종합 의견';
    }
    if(code==='MOB'){
      if(/Technical|Pre[-\s]*Service|Post[-\s]*Service|Service\s*Station|Ingredient|작업대|부재료/i.test(header)||(/테크|기술|technical/i.test(role(row))&&!/센서|sensory/i.test(role(row))))return '테크니컬';
      if(/Creative|창작/i.test(header)||/창작|signature|creative/i.test(text(row['메뉴']||row.Menu)))return '창작음료 센서리';
      return '브루잉 센서리';
    }
    return '';
  }
  function attribute(header,tools){
    var base=text(header).replace(/^(예선|본선|결선)\s*/,'').replace(/Smart\s*Tags?|Tag\s*List|\bTags?\b|스마트\s*태그|태그|Comments?|코멘트|메모/ig,'').replace(/[×x]\s*\d+(?:\.\d+)?/gi,'').trim();
    return tools.label(base).replace(/\s*[×x]\s*\d+(?:\.\d+)?/gi,'').trim();
  }
  function excerpt(raw){
    var value=text(raw).replace(/\s+/g,' ');
    if(!value||/^(?:AI\s*)?자동\s*생성\s*(?:사용|미사용|완료|해제)?$|^(?:true|false|enabled|disabled)$/i.test(value))return '';
    var first=(value.match(/^[\s\S]*?[.!?](?=\s|$)/)||[value])[0].trim();
    return first.length>110?first.slice(0,107).replace(/[\s,.·]+$/,'')+'…':first;
  }
  function recordedFacts(rows){
    var variants=new Set();
    rows.forEach(function(row){
      var facts=[],correct=text(row['정답수']??row['정답개수']),total=text(row['총점']),elapsed=text(row['종료시간']);
      if(/^\d+$/.test(correct))facts.push('정답 '+correct+'개');
      if(/^\d+(?:\.\d+)?$/.test(total))facts.push('총점 '+total+'점');
      if(/^\d[\d\s분초:.,]*$/.test(elapsed))facts.push('종료시간 '+elapsed);
      var mission=row.ktccHiddenMission;
      if(mission&&mission.recorded&&/^(correct|incorrect)$/.test(mission.result))facts.push('히든미션 '+(mission.result==='correct'?'정답 (+4점)':'오답 (0점)'));
      if(facts.length)variants.add(facts.join(' · '));
    });
    return variants.size===1?Array.from(variants)[0]+'.':'';
  }
  function build(code,round,rows,tools){
    code=text(code).toUpperCase();
    if(!/^(KCR|MOC|MOB|KBC|KCAC|KTCC)$/.test(code)||!tools||typeof tools.allows!=='function')return null;
    var groups=new Map();
    function group(name){if(!groups.has(name))groups.set(name,{tags:new Map(),scores:new Map(),comments:new Map()});return groups.get(name);}
    var selected=(rows||[]).filter(function(row){
      if(!row||typeof row!=='object')return false;
      var owner=text(row.competitionCode||row.competition||row['대회코드']);
      var rowRound=text(row.round||row['라운드']);
      return (!owner||owner.toUpperCase()===code)&&(!rowRound||rowRound===round)&&!/calibration|켈리브레이션|캘리브레이션/i.test(text(row.mode||row['모드']));
    });
    selected.forEach(function(row){
      var seenTags=new Set(),rowScores=new Map();
      Object.keys(row).forEach(function(header){
        if(privateHeader.test(header)||!tools.allows(header,row,code))return;
        var raw=row[header];if(raw==null||!text(raw))return;
        var name=scope(code,row,header),data;
        if(tagHeader.test(header)&&attributeHeader.test(header)){
          data=group(name);var label=attribute(header,tools);
          if(!data.tags.has(label))data.tags.set(label,new Map());
          tools.tags(raw).forEach(function(value){
            var tag=text(value),id=key(tag),seen=name+'::'+label+'::'+id;
            if(!tag||seenTags.has(seen))return;seenTags.add(seen);
            var stats=data.tags.get(label);if(!stats.has(id))stats.set(id,{label:tag,count:0});stats.get(id).count++;
          });
        }else if(commentHeader.test(header)){
          var note=excerpt(tools.comment(header,raw,row));
          if(note)group(name).comments.set(key(note),note);
        }else if(code!=='KTCC'&&attributeHeader.test(header)&&!/강도|Intensity|지속성|Persistence|범위|Reference|참조|리프|Leaf|Type/i.test(header)&&!tools.derived(header,code)){
          var max=Number(tools.max(header,code));
          if(!max&&code==='MOB'&&/Station|Ingredient|작업대|부재료/i.test(header))max=5;
          var value=Number(raw);
          if(!Number.isFinite(value)||!max||value<0||value>max)return;
          var scoreLabel=attribute(header,tools),scoreKey=name+'::'+scoreLabel;
          var old=rowScores.get(scoreKey);
          if(!old||(!old.value&&value))rowScores.set(scoreKey,{name:name,label:scoreLabel,value:value,max:max});
        }
      });
      rowScores.forEach(function(item){
        var scores=group(item.name).scores;
        if(!scores.has(item.label))scores.set(item.label,[]);
        scores.get(item.label).push(item.value/item.max);
      });
    });
    var sections=[];
    groups.forEach(function(data,name){
      var sentences=[],flavor=[],details=[];
      data.tags.forEach(function(stats,label){
        var tags=Array.from(stats.values()).sort(function(a,b){return b.count-a.count;}).slice(0,/Flavor|플레이버|향미/i.test(label)?4:3).map(function(item){return item.label;});
        if(!tags.length)return;
        if(/Flavor|플레이버|향미/i.test(label)&&!/Aftertaste|에프터|애프터|피니시|Reference|참조/i.test(label))flavor=flavor.concat(tags);
        else details.push(label+': '+tags.join(', '));
      });
      flavor=Array.from(new Set(flavor)).slice(0,4);
      if(flavor.length)sentences.push('주요 향미로 '+flavor.join(', ')+' 등이 기록되었습니다.');
      if(details.length)sentences.push('세부 항목에는 '+details.slice(0,7).join(' · ')+' 등의 표현이 기록되었습니다.');
      var scores=Array.from(data.scores).map(function(entry){return {label:entry[0],value:entry[1].reduce(function(a,b){return a+b;},0)/entry[1].length};}).sort(function(a,b){return b.value-a.value;});
      if(scores.length>1&&scores[0].value-scores[scores.length-1].value>=.08)sentences.push('항목별 평가에서는 '+scores[0].label+' 점수가 상대적으로 높았고, '+scores[scores.length-1].label+' 점수가 비교적 낮았습니다.');
      else if(scores.length>1)sentences.push('기록된 항목별 평가는 비슷한 점수대로 나타났습니다.');
      else if(scores.length===1&&!flavor.length&&!details.length)sentences.push(scores[0].label+' 항목의 평가가 기록되었습니다.');
      var notes=Array.from(data.comments.values()).slice(0,2);
      if(notes.length)sentences.push('심사 의견에는 '+notes.map(function(note){return '“'+note+'”';}).join(' / ')+' 등이 기록되었습니다.');
      if(sentences.length)sections.push({scope:name,text:sentences.join(' ')});
    });
    if(code==='KTCC'||code==='MOC'){
      var facts=recordedFacts(selected);
      if(facts)sections.unshift({scope:'경기 기록',text:facts});
    }
    if(!sections.length)return null;
    return {intro:code==='KTCC'||code==='MOC'?'공식 제출된 심사 의견과 경기 기록을 종합했습니다.':'공식 제출된 심사 의견을 종합했습니다.',sections:sections};
  }
  root.KclDebriefSummary={build:build};
})(typeof window!=='undefined'?window:globalThis);
