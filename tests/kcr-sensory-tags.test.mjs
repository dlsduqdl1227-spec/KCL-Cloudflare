import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tagsSource = fs.readFileSync(path.join(root, "public", "assets", "kcr-sensory-tags.js"), "utf8");
const commentsSource = fs.readFileSync(path.join(root, "public", "assets", "kcr-sensory-comments.js"), "utf8");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const debriefing = fs.readFileSync(path.join(root, "public", "debriefing", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} function is incomplete`);
}

const context = {};
vm.createContext(context);
vm.runInContext(tagsSource, context, { filename: "kcr-sensory-tags.js" });
vm.runInContext(commentsSource, context, { filename: "kcr-sensory-comments.js" });

const tags = Array.from(context.KCR_SENSORY_TAGS);
const api = context.KcrSensoryTags;
const comments = context.KcrSensoryComments;
assert.deepEqual(Array.from(context.KCR_SENSORY_CONFIG.categoryOrder), ["flavor", "aftertaste", "acidity", "sweetness", "mouthfeel"]);
assert.equal(new Set(tags.map((tag) => tag.id)).size, tags.length, "KCR tag IDs must be unique");
assert.equal(tags.length, 151, "The KCR tag catalog must include 13 selectable Flavor family tags");
assert.deepEqual(
  Object.fromEntries(["flavor", "mouthfeel", "acidity", "sweetness", "aftertaste"].map((category) => [category, tags.filter((tag) => tag.category === category).length])),
  { flavor:83, mouthfeel:18, acidity:15, sweetness:14, aftertaste:21 },
);
assert.equal(tags.some((tag) => tag.id === "flavor_improvement_raw" || tag.labelKo === "생두"), false);
for (const tag of tags) {
  for (const field of ["id", "category", "group", "family", "labelKo", "labelEn", "order", "level", "isFamily", "parentId", "isActive"]) {
    assert.notEqual(tag[field], undefined, `Missing ${field} on ${tag.id}`);
  }
  assert.notEqual(tag.category, "body");
}

const flavorIds = Array.from(api.list("flavor")).slice(0, 6).map((tag) => tag.id);
const tropicalParent = api.familyTag("flavor", "tropical");
const pineappleId = "flavor_tropical_pineapple";
assert.equal(tropicalParent.labelKo, "열대과일 계열");
assert.equal(api.familyTag("flavor", "improvement"), null, "Structural refinement groups must remain navigation-only");
assert.equal(api.familyTag("mouthfeel", "primary"), null, "Non-descriptive structural groups must not become tags");
assert.equal(api.list("flavor", "tropical").some((tag) => tag.id === tropicalParent.id), false, "Family tags must not be repeated among child options");
let hierarchySelection = Array.from(api.toggle([], tropicalParent.id, "flavor", 0).selected);
assert.deepEqual(hierarchySelection, [tropicalParent.id], "A broad family must be selectable on its own");
hierarchySelection = Array.from(api.toggle(hierarchySelection, pineappleId, "flavor", 0).selected);
assert.deepEqual(hierarchySelection, [pineappleId], "Selecting a child must replace its family tag");
hierarchySelection = Array.from(api.toggle(hierarchySelection, tropicalParent.id, "flavor", 0).selected);
assert.deepEqual(hierarchySelection, [tropicalParent.id], "Selecting the family again must replace same-family children");
assert.deepEqual(Array.from(api.sanitize([tropicalParent.id, pineappleId], "flavor")), [pineappleId], "Saved parent-child conflicts must prefer the more specific child");
const fullHierarchySelection = [tropicalParent.id, flavorIds[0], flavorIds[5], "flavor_berry_strawberry", "flavor_pome_apple"];
const fullHierarchyReplacement = api.toggle(fullHierarchySelection, pineappleId, "flavor", 0);
assert.equal(fullHierarchyReplacement.success, true, "Replacing a family at the five-tag limit must not be blocked");
assert.equal(fullHierarchyReplacement.selected.length, 5);
assert.equal(fullHierarchyReplacement.selected.includes(tropicalParent.id), false);
assert.equal(fullHierarchyReplacement.selected.includes(pineappleId), true);
assert.deepEqual(Array.from(api.syncAftertasteFlavorRefs([tropicalParent.id], [tropicalParent.id])), [tropicalParent.id]);
let selected = [];
for (const id of flavorIds.slice(0, 5)) {
  const result = api.toggle(selected, id, "flavor", 0);
  assert.equal(result.success, true);
  selected = Array.from(result.selected);
}
assert.deepEqual(selected, flavorIds.slice(0, 5), "Selection order must be retained");
const blockedFlavor = api.toggle(selected, flavorIds[5], "flavor", 0);
assert.equal(blockedFlavor.success, false);
assert.equal(blockedFlavor.selected.length, 5);
const deselectedFlavor = api.toggle(selected, flavorIds[2], "flavor", 0);
assert.equal(deselectedFlavor.success, true);
assert.deepEqual(Array.from(deselectedFlavor.selected), [flavorIds[0], flavorIds[1], flavorIds[3], flavorIds[4]]);

const aftertasteIds = Array.from(api.list("aftertaste")).slice(0, 3).map((tag) => tag.id);
let aftertaste = [];
for (const id of aftertasteIds.slice(0, 2)) aftertaste = Array.from(api.toggle(aftertaste, id, "aftertaste", 1).selected);
const blockedAftertaste = api.toggle(aftertaste, aftertasteIds[2], "aftertaste", 1);
assert.equal(blockedAftertaste.success, false, "Aftertaste tags and Flavor references share a limit of three");
assert.deepEqual(Array.from(api.syncAftertasteFlavorRefs([flavorIds[0]], [flavorIds[0], flavorIds[1]])), [flavorIds[0]]);
assert.deepEqual(Array.from(api.sanitize(["citrus", "flavor_citrus", flavorIds[0]], "flavor")), [flavorIds[0]], "Navigation labels must never be stored as tags");

let state = comments.syncState({}, "flavor", [flavorIds[0]], {});
assert.match(state.customComment, new RegExp(api.get(flavorIds[0]).labelKo));
state = comments.editState(state, "심사위원이 직접 수정한 코멘트");
const protectedState = comments.syncState(state, "flavor", [flavorIds[1]], {});
assert.equal(protectedState.customComment, "심사위원이 직접 수정한 코멘트", "Tag changes must not overwrite a touched comment");
const resetState = comments.resetState(protectedState, "flavor", [flavorIds[1]], {});
assert.equal(resetState.commentTouched, false);
assert.match(resetState.customComment, new RegExp(api.get(flavorIds[1]).labelKo));
assert.equal(comments.manualComment(protectedState), "심사위원이 직접 수정한 코멘트");
assert.equal(comments.manualComment(resetState), "", "Untouched auto comments must not be duplicated in the overall comment");
assert.equal(comments.generateFlavorComment([]), "");
assert.match(comments.generateFlavorComment([tropicalParent.id]), /열대과일 계열/);
assert.doesNotMatch(comments.generateFlavorComment([pineappleId]), /열대과일 계열/);
assert.match(comments.generateFlavorComment([pineappleId]), /파인애플/);
assert.equal(
  comments.generateFlavorComment(["flavor_floral_jasmine", "flavor_stone_fruit_peach", "flavor_tea_black_tea"]),
  "재스민과 복숭아, 홍차가 연상되는 향미입니다.",
);
assert.equal(
  comments.generateFlavorComment(["flavor_sweet_caramel", "flavor_nutty_hazelnut", "flavor_improvement_papery"]),
  "캐러멜과 헤이즐넛이 연상되며, 종이 같은 인상이 함께 느껴집니다.",
);
assert.equal(
  comments.generateMouthfeelComment(["mouthfeel_silky", "mouthfeel_juicy", "mouthfeel_round"]),
  "실키하고 과즙감 있는 마우스필이 둥글게 표현됩니다.",
);
assert.equal(
  comments.generateAftertasteComment(["aftertaste_clean"], { aftertasteFlavorTagIds:["flavor_stone_fruit_peach", "flavor_floral_jasmine"] }),
  "복숭아와 재스민 향이 남으며 깔끔하게 마무리됩니다.",
);

const headerContext = { safeStr: (value) => String(value || "") };
vm.createContext(headerContext);
vm.runInContext(extractFunction(rpc, "expectedHeadersForCompetition"), headerContext);
const headers = Array.from(headerContext.expectedHeadersForCompetition("KCR")).slice(7);
assert.ok(headers.indexOf("Flavor(플레이버)") < headers.indexOf("Aftertaste(에프터테이스트)"));
assert.ok(headers.indexOf("Aftertaste(에프터테이스트)") < headers.indexOf("Acidity(산미)"));
assert.ok(headers.indexOf("Acidity(산미)") < headers.indexOf("Sweetness(단맛) ×2"));
assert.ok(headers.indexOf("Sweetness(단맛) ×2") < headers.indexOf("Mouthfeel(마우스필)"));
assert.ok(headers.indexOf("Mouthfeel(마우스필)") < headers.indexOf("Overall(오버롤)"));
assert.equal(headers.some((header) => /Body|바디/.test(header)), false);
assert.ok(headers.includes("Aftertaste 플레이버참조 스마트태그"));

const reviewContext = {
  _reviewState: { code:"KCR" },
  KcrSensoryTags: api,
  KCR_SENSORY_CONFIG: context.KCR_SENSORY_CONFIG,
  reviewBaseKeyFromHeader: () => "aftertaste",
  reviewKcrTagsValue_: () => [flavorIds[0]],
  SMART_TAGS: {},
};
vm.createContext(reviewContext);
vm.runInContext(extractFunction(assessment, "reviewSmartTagMeta_"), reviewContext);
const referenceMeta = reviewContext.reviewSmartTagMeta_("Aftertaste 플레이버참조 스마트태그");
assert.equal(referenceMeta.isFlavorReference, true);
assert.equal(referenceMeta.category, "flavor");
assert.deepEqual(Array.from(referenceMeta.data), [flavorIds[0]]);

const kcrMarkupStart = assessment.indexOf('id="evalCupping"');
const kcrMarkupEnd = assessment.indexOf('id="evalKcac"', kcrMarkupStart);
const kcrMarkup = assessment.slice(kcrMarkupStart, kcrMarkupEnd > 0 ? kcrMarkupEnd : assessment.length);
for (const marker of ["flavor", "aftertaste", "acidity", "sweetness", "mouthfeel", "overall"]) assert.ok(kcrMarkup.includes(marker));
assert.ok(kcrMarkup.indexOf("sweetness") < kcrMarkup.indexOf("mouthfeel"));
assert.match(assessment, /result\.selected/);
assert.doesNotMatch(assessment, /result\.ids/);
assert.match(assessment, /KcrSensoryTags\.labels\(c\.flavorTagIds/);
assert.match(extractFunction(assessment, "renderKcrSensoryTagsHtml_"), /KcrSensoryTags\.familyTag/);
assert.match(extractFunction(assessment, "toggleKcrTagFamily"), /toggleKcrTag\(attr, parentId\)/);
assert.match(extractFunction(assessment, "reviewKcrSmartTagButtonsHtml_"), /toggleReviewKcrTagFamily/);
assert.match(extractFunction(assessment, "generateCuppingComment"), /attributeComments\s*:\s*kcrManualAttributeComments_\(c\)/);
assert.doesNotMatch(extractFunction(assessment, "generateCuppingComment"), /cupNumber\s*:/);
assert.match(extractFunction(assessment, "reviewBuildKcrCommentPayload_"), /attributeComments\s*:\s*reviewKcrManualAttributeComments_/);
assert.doesNotMatch(extractFunction(assessment, "reviewBuildKcrCommentPayload_"), /cupNumber\s*:/);
const reviewCommentValues = {
  "Flavor 코멘트":"오렌지가 연상되는 향미입니다.",
  "Flavor 자동생성상태":JSON.stringify({ generatedComment:"오렌지가 연상되는 향미입니다.", commentTouched:false }),
  "Acidity 코멘트":"식으면서 산미가 더 밝아짐",
  "Acidity 자동생성상태":JSON.stringify({ generatedComment:"밝은 산미입니다.", commentTouched:true }),
  "Mouthfeel 코멘트":"질감이 조금 거칠게 남음",
};
const reviewManualContext = {
  reviewTextByNames_: (names) => reviewCommentValues[names[0]] || "",
};
vm.createContext(reviewManualContext);
vm.runInContext(extractFunction(assessment, "reviewKcrManualAttributeComments_"), reviewManualContext);
assert.deepEqual(Array.from(reviewManualContext.reviewKcrManualAttributeComments_()), [
  "산미: 식으면서 산미가 더 밝아짐",
  "마우스필: 질감이 조금 거칠게 남음",
]);
assert.match(extractFunction(assessment, "reviewKcrTotalInfo_"), /reviewKcrScoreValue_\('mouthfeel'\)/);
assert.doesNotMatch(extractFunction(assessment, "reviewKcrTotalInfo_"), /reviewKcrScoreValue_\('body'\)/);
assert.match(extractFunction(assessment, "canReviewEditDetails"), /c === 'KCR' && isTeamLeaderForCode_\(c\)/);
assert.match(rpc, /flavor \+ after \+ acidity \+ \(sweet \* 2\) \+ mouthfeel \+ overall/);
assert.match(extractFunction(rpc, "tieInfoForItem_"), /Overall\(오버롤\)/);
assert.match(extractFunction(rpc, "aggregateRankingGroup_"), /Overall\(오버롤\)/);
assert.match(debriefing, /Mouthfeel\(마우스필\)/);
assert.match(debriefing, /kcrPublicTagLabels_/);
assert.match(extractFunction(debriefing, "buildCommentBox"), /자동생성상태/);

const rpcCommentContext = {};
vm.createContext(rpcCommentContext);
for (const name of [
  "safeStr", "_num", "_avg", "_result", "_scoreItems", "_lowHighScore",
  "_joinWithComma", "_cleanTagText_", "_tagList_", "_tagPhrase_",
  "_briefComments", "_areaKorean_", "_fmt", "_commentVariationKey_",
  "_commentHash_", "_optionSet", "generateCuppingComment",
]) vm.runInContext(extractFunction(rpc, name), rpcCommentContext);
const overallResult = rpcCommentContext.generateCuppingComment({
  cupNumber:"1",
  flavor:4.2, aftertaste:3.8, acidity:4.0, sweetness:4.4, mouthfeel:3.6, overall:4.0,
  tags:{ flavor:["오렌지"], aftertaste:["깔끔한"], acidity:["밝은"], sweetness:["꿀 같은"], mouthfeel:["실키한"] },
  attributeComments:"플레이버: 오렌지 껍질 향이 선명함 / 산미: 식으면서 밝아짐",
});
assert.equal(overallResult.comments.length, 2);
for (const text of overallResult.comments) {
  assert.match(text, /오렌지 껍질 향이 선명함/);
  assert.match(text, /식으면서 밝아짐/);
  assert.doesNotMatch(text, /1번\s*컵|해당\s*컵은/);
}

process.stdout.write("KCR sensory tag tests passed.\n");
