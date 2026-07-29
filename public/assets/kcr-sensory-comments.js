(function(global) {
  "use strict";

  function hasBatchim(text) {
    var value = String(text || "").trim();
    if (!value) return false;
    var code = value.charCodeAt(value.length - 1);
    return code >= 0xAC00 && code <= 0xD7A3 && ((code - 0xAC00) % 28) !== 0;
  }
  function particle(text, withBatchim, withoutBatchim) {
    return hasBatchim(text) ? withBatchim : withoutBatchim;
  }
  function joinNatural(values) {
    var list = (values || []).filter(Boolean);
    if (!list.length) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + particle(list[0], "과 ", "와 ") + list[1];
    return list[0] + particle(list[0], "과 ", "와 ") + list.slice(1).join(", ");
  }
  function records(ids, category) {
    return (global.KcrSensoryTags ? global.KcrSensoryTags.sanitize(ids, category) : []).map(function(id) {
      return global.KcrSensoryTags.get(id);
    }).filter(Boolean);
  }
  function labelList(ids, category) {
    return records(ids, category).map(function(tag) { return tag.labelKo; });
  }
  function baseLikeLabel(label) {
    return String(label || "").replace(/\s*같은$/, "").trim();
  }
  function subjectSentence(phrase, ending) {
    if (!phrase) return "";
    return phrase + particle(phrase, "이 ", "가 ") + ending;
  }
  function objectSentence(phrase, ending) {
    if (!phrase) return "";
    return phrase + particle(phrase, "을 ", "를 ") + ending;
  }

  function generateFlavorComment(selectedIds) {
    var selected = records(selectedIds, "flavor");
    var primary = selected.filter(function(tag) { return tag.group === "primary"; }).map(function(tag) { return tag.labelKo; });
    var improvement = selected.filter(function(tag) { return tag.group === "improvement"; }).map(function(tag) { return tag.labelKo; });
    if (!primary.length && !improvement.length) return "";
    if (primary.length && improvement.length) {
      return subjectSentence(joinNatural(primary), "연상되며, ") + joinNatural(improvement) + " 같은 인상이 함께 느껴집니다.";
    }
    if (primary.length) return subjectSentence(joinNatural(primary), "연상되는 향미입니다.");
    return objectSentence(joinNatural(improvement), "연상시키는 향미가 느껴집니다.");
  }

  function generateMouthfeelComment(selectedIds) {
    var ids = records(selectedIds, "mouthfeel").map(function(tag) { return tag.id; });
    var labels = labelList(ids, "mouthfeel");
    if (!labels.length) return "";
    if (["mouthfeel_silky", "mouthfeel_juicy", "mouthfeel_round"].every(function(id) { return ids.indexOf(id) > -1; })) {
      return "실키하고 과즙감 있는 마우스필이 둥글게 표현됩니다.";
    }
    if (["mouthfeel_creamy", "mouthfeel_dense", "mouthfeel_coating"].every(function(id) { return ids.indexOf(id) > -1; })) {
      return "크리미하고 밀도감 있는 마우스필과 코팅감이 느껴집니다.";
    }
    if (["mouthfeel_rough", "mouthfeel_dry", "mouthfeel_astringent"].every(function(id) { return ids.indexOf(id) > -1; })) {
      return "거친 질감과 드라이한 감각이 느껴지며 수렴감이 남습니다.";
    }
    if (labels.length === 1) return labels[0] + " 마우스필이 느껴집니다.";
    if (labels.length === 2) return labels[0] + " 특성과 " + labels[1] + " 특성이 마우스필에 함께 나타납니다.";
    return labels.slice(0, -1).join(", ") + ", 그리고 " + labels[labels.length - 1] + " 특성이 마우스필에 함께 나타납니다.";
  }

  function generateAcidityComment(selectedIds) {
    var labels = labelList(selectedIds, "acidity").map(baseLikeLabel);
    return labels.length ? objectSentence(joinNatural(labels), "연상시키는 산미입니다.") : "";
  }

  function generateSweetnessComment(selectedIds) {
    var labels = labelList(selectedIds, "sweetness").map(baseLikeLabel);
    return labels.length ? objectSentence(joinNatural(labels), "연상시키는 단맛입니다.") : "";
  }

  function generateAftertasteComment(selectedIds, options) {
    options = options || {};
    var flavorLabels = labelList(options.aftertasteFlavorTagIds || [], "flavor");
    var selected = records(selectedIds, "aftertaste");
    var primary = selected.filter(function(tag) { return tag.group === "primary"; });
    var improvement = selected.filter(function(tag) { return tag.group === "improvement"; });
    if (!flavorLabels.length && !selected.length) return "";

    var primaryEnding = {
      aftertaste_sweet:"달콤하게", aftertaste_clean:"깔끔하게", aftertaste_aromatic:"향긋하게",
      aftertaste_smooth:"부드럽게", aftertaste_tea_like:"차 같은 인상으로",
      aftertaste_chocolate_like:"초콜릿 같은 인상으로", aftertaste_caramel_like:"캐러멜 같은 인상으로",
      aftertaste_nutty:"견과류 같은 인상으로", aftertaste_spicy:"향신료 같은 인상으로",
      aftertaste_roasted:"로스티드한 인상으로"
    };
    var improvementNoun = {
      aftertaste_bitter:"쓴맛", aftertaste_dry:"드라이한 감각", aftertaste_astringent:"수렴감",
      aftertaste_rough:"거친 질감", aftertaste_pasty:"텁텁한 감각", aftertaste_smoky:"연기 같은 인상",
      aftertaste_burnt:"탄 맛", aftertaste_woody:"나무 같은 인상", aftertaste_papery:"종이 같은 인상",
      aftertaste_metallic:"금속 같은 인상", aftertaste_hollow:"비어 있는 인상"
    };
    var primaryText = primary.map(function(tag) { return primaryEnding[tag.id] || (tag.labelKo + " 인상으로"); });
    if (primaryText.length > 1) {
      primaryText = primaryText.map(function(text, index) {
        if (index === primaryText.length - 1) return text;
        if (/하게$/.test(text)) return text.replace(/하게$/, "하고");
        if (/럽게$/.test(text)) return text.replace(/럽게$/, "럽고");
        return text.replace(/으로$/, "과 함께");
      });
    }
    var improvementText = improvement.map(function(tag) { return improvementNoun[tag.id] || tag.labelKo; });
    if (["aftertaste_bitter", "aftertaste_dry", "aftertaste_astringent"].every(function(id) { return selected.some(function(tag) { return tag.id === id; }); }) && !flavorLabels.length && !primary.length) {
      return "쓴맛과 드라이한 감각이 남으며 수렴감이 느껴집니다.";
    }

    var flavorPhrase = flavorLabels.length ? joinNatural(flavorLabels) + " 향이 남" : "";
    var primaryPhrase = primaryText.length ? primaryText.join(" ") + " 마무리됩니다" : "";
    var improvementPhrase = improvementText.length ? subjectSentence(joinNatural(improvementText), "남습니다") : "";
    if (flavorPhrase && primaryPhrase && !improvementPhrase) return flavorPhrase + "으며 " + primaryPhrase + ".";
    if (flavorPhrase && !primaryPhrase && improvementPhrase) return flavorPhrase + "으며 " + improvementPhrase + ".";
    if (!flavorPhrase && primaryPhrase && improvementPhrase) return primaryPhrase + ". " + improvementPhrase + ".";
    var parts = [];
    if (flavorPhrase) parts.push(flavorPhrase + "습니다");
    if (primaryPhrase) parts.push(primaryPhrase);
    if (improvementPhrase) parts.push(improvementPhrase);
    return parts.join(". ") + ".";
  }

  function generate(category, selectedIds, options) {
    if (category === "flavor") return generateFlavorComment(selectedIds);
    if (category === "mouthfeel") return generateMouthfeelComment(selectedIds);
    if (category === "acidity") return generateAcidityComment(selectedIds);
    if (category === "sweetness") return generateSweetnessComment(selectedIds);
    if (category === "aftertaste") return generateAftertasteComment(selectedIds, options);
    return "";
  }

  function createState(state) {
    state = state || {};
    return {
      generatedComment: String(state.generatedComment || ""),
      customComment: String(state.customComment || ""),
      commentTouched: !!state.commentTouched
    };
  }
  function syncState(state, category, selectedIds, options) {
    var next = createState(state);
    next.generatedComment = generate(category, selectedIds, options);
    if (!next.commentTouched) next.customComment = next.generatedComment;
    return next;
  }
  function editState(state, value) {
    var next = createState(state);
    next.customComment = String(value || "");
    next.commentTouched = next.customComment !== next.generatedComment;
    return next;
  }
  function resetState(state, category, selectedIds, options) {
    var next = createState(state);
    next.generatedComment = generate(category, selectedIds, options);
    next.customComment = next.generatedComment;
    next.commentTouched = false;
    return next;
  }

  global.KcrSensoryComments = {
    generate: generate,
    generateFlavorComment: generateFlavorComment,
    generateMouthfeelComment: generateMouthfeelComment,
    generateAcidityComment: generateAcidityComment,
    generateSweetnessComment: generateSweetnessComment,
    generateAftertasteComment: generateAftertasteComment,
    createState: createState,
    syncState: syncState,
    editState: editState,
    resetState: resetState
  };
})(typeof window !== "undefined" ? window : globalThis);
