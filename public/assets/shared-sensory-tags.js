(function(global) {
  "use strict";

  function unique(values) {
    var out = [];
    (values || []).forEach(function(value) {
      value = String(value || "").trim();
      if (value && out.indexOf(value) < 0) out.push(value);
    });
    return out;
  }

  function kcrRows(category) {
    return (global.KCR_SENSORY_TAGS || []).filter(function(tag) {
      return tag && tag.isActive && !tag.isFamily && tag.category === category;
    });
  }

  function familyLabel(family) {
    var labels = global.KCR_SENSORY_CONFIG && global.KCR_SENSORY_CONFIG.familyLabels;
    return (labels && labels[family] && labels[family].ko) || family || "기타";
  }

  function buildKcrStyleTree(category) {
    var rows = kcrRows(category);
    var primary = {};
    var refinement = [];

    rows.forEach(function(tag) {
      if (tag.group === "improvement") {
        refinement.push(tag.labelKo);
        return;
      }
      var family = familyLabel(tag.family);
      if (!primary[family]) primary[family] = [];
      primary[family].push(tag.labelKo);
    });

    Object.keys(primary).forEach(function(key) {
      primary[key] = unique(primary[key]);
    });
    refinement = unique(refinement);

    var result = {};
    if (category === "flavor") {
      Object.keys(primary).forEach(function(family) {
        result[family] = primary[family];
      });
    } else {
      var primaryFlat = [];
      Object.keys(primary).forEach(function(key) {
        primaryFlat = primaryFlat.concat(primary[key]);
      });
      if (primaryFlat.length) result["주요 표현"] = unique(primaryFlat);
    }
    if (refinement.length) result["보완 표현"] = refinement;
    return result;
  }

  function conflicts(positive, refinement) {
    var result = {};
    positive.forEach(function(tag) { result[tag] = refinement.slice(); });
    refinement.forEach(function(tag) { result[tag] = positive.slice(); });
    return result;
  }

  var mouthfeel = buildKcrStyleTree("mouthfeel");
  var mouthfeelPositive = (mouthfeel["주요 표현"] || []).slice();
  var mouthfeelRefinement = (mouthfeel["보완 표현"] || []).slice();

  global.KCL_SENSORY_SMART_TAGS = {
    flavor: buildKcrStyleTree("flavor"),
    aftertaste: buildKcrStyleTree("aftertaste"),
    acidity: buildKcrStyleTree("acidity"),
    sweetness: buildKcrStyleTree("sweetness"),
    mouthfeel: mouthfeel,
    mouthfeelConflicts: conflicts(mouthfeelPositive, mouthfeelRefinement),

    ikrcAcidity: {
      "주요 표현": ["선명한", "부드러운", "과즙감 있는", "밝은", "강렬한", "산뜻한", "섬세한"],
      "보완 표현": ["평평한", "신맛이 도드라진", "거친"]
    },

    cleanCup: {
      "긍정": ["깨끗한", "투명한", "선명한", "정돈된", "후미가 깔끔한", "결점이 없는"],
      "보완": ["흐린", "탁한", "떫은", "종이 같은", "페놀릭", "먼지 같은", "곰팡이 같은", "발효취", "탄 맛"]
    },

    balance: {
      "긍정": ["단맛·산미·쓴맛의 조화", "향미 흐름이 안정적", "중심 향미가 명확", "후미 균형이 안정적", "구성 요소가 자연스럽게 연결"],
      "보완": ["산미가 과도함", "쓴맛이 과도함", "단맛이 부족함", "향미가 충돌함", "중심 향미가 불명확", "후미 균형이 무너짐"]
    },

    tasteDesign: {
      "긍정": ["설명과 실제 맛이 일치", "향미 구조가 명확", "의도가 분명하게 구현", "단맛·산미·쓴맛의 조화", "후미 설계가 안정적"],
      "보완": ["설명과 실제 맛이 불일치", "향미 연결이 약함", "산미가 과도함", "쓴맛이 과도함", "단맛이 부족함", "후미가 불균형함"]
    },

    milkTasteBalance: {
      "긍정": ["커피와 우유의 조화", "단맛 중심의 균형", "산미가 조화를 보조", "쓴맛이 절제됨", "후미가 깔끔함"],
      "보완": ["커피 맛이 과도함", "우유 맛이 과도함", "산미가 따로 느껴짐", "쓴맛이 과도함", "단맛이 부족함", "후미가 불균형함"]
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
