import { safeStr } from "../../utils/validation";
import { roundTotal, scoreText } from "../scoring/common";
import { band5, qual5, qual5Kcac } from "./scoreBands";
import { flattenSmartTags, joinTags, smartTagTone } from "./smartTagDictionary";
import { avg, itemList, metricItems, sortItems, tidyComment } from "./templates";

export type CommentResult = { success: boolean; comments: string[]; message?: string };

export function generateCuppingComment(payload: any): CommentResult {
  try {
    const fl = Number(payload.flavor) || 0;
    const at = Number(payload.aftertaste) || 0;
    const ac = Number(payload.acidity) || 0;
    const bo = Number(payload.body) || 0;
    const sw = Number(payload.sweetness) || 0;
    const ov = Number(payload.overall) || 0;
    const tags = payload.tags || {};
    const flTags = (tags.flavor || []).slice(0, 3);
    const atTags = (tags.aftertaste || []).slice(0, 2);
    const boTags = (tags.body || []).slice(0, 2);
    const swTags = (tags.sweetness || []).slice(0, 2);
    const qual = (v: number) => v >= 4.75 ? "인상적인" : v >= 4 ? "풍부한" : v >= 3.5 ? "안정적인" : v >= 3 ? "기준에 부합하는" : v >= 2 ? "다소 약한" : "개선이 필요한";
    const acDesc = (v: number) => v >= 4.5 ? "밝고 선명한 산미" : v >= 3.5 ? "균형 잡힌 산미" : v >= 2.5 ? "은은한 산미" : "낮은 산미";
    const boDesc = (v: number) => v >= 4.5 ? "묵직하고 풍부한 바디" : v >= 3.5 ? "중간 바디" : v >= 2.5 ? "가벼운 바디" : "얇은 바디";
    const swDesc = (v: number) => v >= 4.5 ? "단맛이 매우 선명하게 느껴지며" : v >= 3.5 ? "적절한 단맛이 받쳐주며" : v >= 2.5 ? "은은한 단맛이 느껴지며" : "단맛이 다소 부족하며";
    const flStr = flTags.length ? `${flTags.join(", ")} 계열의 ` : "";
    const atStr = atTags.length ? `${atTags.join(", ")} 느낌의 여운이 남는다` : at >= 4 ? "깔끔하고 긴 여운이 인상적이다" : "피니시가 짧게 마무리된다";
    const boStr = boTags.length ? `${boTags.join(", ")} 질감의 ${boDesc(bo)}` : boDesc(bo);
    const swStr = swTags.length ? `${swTags[0]} 계열의 단맛이 느껴지며 ` : "";
    const c1 = `${flStr}${qual(fl)} Flavor가 돋보이며, ${acDesc(ac)}와 ${boStr}이 전체적인 구조를 형성한다. ${(swStr || swDesc(sw) + " ")}피니시까지 일관된 향미 흐름을 보인다.`;
    const c2 = `${ov >= 4 ? "전반적으로 완성도 높은 샘플로, " : ov >= 3 ? "기준 이상의 균형감을 갖춘 샘플로, " : "개선 여지가 있는 샘플로, "}${qual(fl)} Flavor와 ${acDesc(ac)}, ${boDesc(bo)} 조합이 인상적이다. ${swTags.length ? swTags.join(", ") + " 계열의 단맛이 " : swDesc(sw) + " "}Sweetness 구조를 잡아주며, ${atStr}.`;
    const c3 = `${qual(fl)} 향미와 ${acDesc(ac)} 사이의 균형이 주목된다. ${boTags.length ? boTags.join(" · ") + " 질감에서 느껴지는 " + boDesc(bo) + " " : boDesc(bo) + " "}Body감이 음료를 지지하며, Overall ${ov >= 4 ? "완성도가 높아 인상적인 샘플이다." : ov >= 3 ? "완성도가 기준을 충족하는 샘플이다." : "향미 일관성 향상이 필요한 샘플이다."}`;
    return { success: true, comments: [c1, c2, c3].map(tidyComment) };
  } catch (e: any) {
    return { success: false, comments: [], message: String(e && e.message || e) };
  }
}

export function generateKbcComment(payload: any): CommentResult {
  try {
    payload = payload || {};
    const presentationVal = parseFloat(payload.presentationVal) || 0;
    const espressoVals = payload.espressoVals || [];
    const sigVals = payload.sigVals || [];
    const machineVal = parseFloat(payload.machineVal) || 0;
    const isMain = !!payload.isMain;
    const subtotalScore = Number.isFinite(parseFloat(payload.subtotalScore)) ? parseFloat(payload.subtotalScore) : roundTotal(
      presentationVal +
      (parseFloat(espressoVals[0]) || 0) * 2 + (parseFloat(espressoVals[1]) || 0) + (parseFloat(espressoVals[2]) || 0) + (parseFloat(espressoVals[3]) || 0) +
      (isMain ? ((parseFloat(sigVals[0]) || 0) * 2 + (parseFloat(sigVals[1]) || 0) + (parseFloat(sigVals[2]) || 0) + (parseFloat(sigVals[3]) || 0)) : 0) +
      machineVal
    );
    const totalScore = Number.isFinite(parseFloat(payload.totalScore)) ? parseFloat(payload.totalScore) : subtotalScore;
    const timePenalty = Number.isFinite(parseFloat(payload.timePenalty)) ? parseFloat(payload.timePenalty) : Math.max(0, roundTotal(subtotalScore - totalScore));
    const espressoAvg = avg(espressoVals);
    const sigAvg = sigVals.length ? avg(sigVals) : null;
    const espressoItems = metricItems("에스프레소", ["맛과 설계", "클린컵", "마우스필", "플레이버"], espressoVals);
    const sigItems = metricItems("창작음료", ["맛과 설계", "클린컵", "마우스필", "플레이버"], sigVals);
    const allItems = [{ group: "프레젠테이션", name: "서비스 전문성", score: presentationVal }, ...espressoItems, ...(isMain ? sigItems : []), { group: "운용", name: "머신 및 기물", score: machineVal }];
    const maxScore = isMain ? 60 : 35;
    const ratio = maxScore ? subtotalScore / maxScore : 0;
    const summary = ratio >= 0.88 ? "전체적으로 2026 KBC 기준에서 완성도와 서비스 전문성이 뚜렷하게 드러난 시연이었다." :
      ratio >= 0.78 ? "전반적인 흐름은 안정적이며, 음료 설계와 운영 강점이 명확하게 보이는 시연이었다." :
      ratio >= 0.65 ? "기본 구성은 갖췄으나 맛의 설계, 표현, 운영 디테일을 더 구체화할 필요가 있다." :
      "프레젠테이션, 음료 완성도, 머신 및 기물 운용 전반에서 우선순위를 정한 보완이 필요하다.";
    const tags = flattenSmartTags(payload.tags || {});
    const positives = joinTags(tags.filter((t) => smartTagTone(t) === "positive"), 8);
    const refines = joinTags(tags.filter((t) => smartTagTone(t) === "refine"), 6);
    const timeSentence = timePenalty > 0 ? ` 시간 초과 감점 -${scoreText(timePenalty, 1)}점은 최종 총점에 별도 반영된다.` : "";
    const strongest = sortItems(allItems, true);
    const weakest = sortItems(allItems, false);
    const attr = safeStr(payload.attributeComments || "").replace(/\s+/g, " ").substring(0, 220);
    const c1 = `프레젠테이션과 서비스는 ${band5(presentationVal)} 수준이며, 에스프레소는 평균 ${espressoAvg.toFixed(1)}점으로 ${band5(espressoAvg)} 인상을 보였다. 머신 및 기물 운용은 ${machineVal.toFixed(1)}점으로 ${band5(machineVal)} 흐름이다.${isMain && sigAvg != null ? ` 창작음료는 평균 ${sigAvg.toFixed(1)}점으로 ${band5(sigAvg)} 완성도를 보였다.` : ""}${attr ? ` 세부 코멘트의 "${attr}" 내용도 종합 인상에 반영된다.` : ""}${positives ? ` 강점 스마트태그(${positives})가 긍정 근거로 반영된다.` : ""}${refines ? ` 보완 스마트태그(${refines})는 후속 설명에서 구체화할 항목으로 반영된다.` : ""} ${summary}${timeSentence}`;
    const c2 = `${timePenalty > 0 ? `시간감점 전 개별 항목 소계 ${subtotalScore.toFixed(1)}점 기준으로 보면 ` : `총점 ${totalScore.toFixed(1)}점 기준으로 보면 `}${strongest.length ? itemList(strongest, 3, true) + "가 가장 돋보인다. " : "평가 항목 전반의 균형 확인이 필요하다. "}${weakest.length && weakest[0].score < 4 ? `다음 시연에서는 ${itemList(weakest, 2, true)}를 우선 보완하면 전체 완성도가 올라갈 수 있다. ` : "낮은 항목도 큰 흔들림 없이 관리되어 현재 강점을 유지하면서 디테일을 정교하게 다듬는 방향이 적절하다. "}${positives ? `강점 태그는 ${positives} 중심으로 기록되어 긍정적인 맛 표현을 보강한다. ` : ""}${refines ? `보완 태그는 ${refines} 중심으로 정리한다. ` : ""}${timeSentence || summary}`;
    const c3 = `에스프레소는 ${itemList(sortItems(espressoItems, true), 2, false)}가 긍정적으로 읽힌다. ${isMain && sigItems.length ? `창작음료에서는 ${itemList(sortItems(sigItems, true), 2, false)}가 주요 인상이다. ` : ""}서비스와 작업 운영은 각각 ${presentationVal.toFixed(1)}점, ${machineVal.toFixed(1)}점으로 기록되었다. ${attr ? `세부 항목 코멘트에 기록된 "${attr}" 포인트를 중심으로 최종 총평을 구성했다. ` : ""}${positives ? `스마트태그 기준으로는 ${positives}가 우수 항목으로 함께 반영되었다. ` : ""}${refines ? `보완 설명은 ${refines}를 중심으로 구체화한다. ` : ""}${summary}${timeSentence}`;
    return { success: true, comments: [c1, c2, c3].map(tidyComment) };
  } catch (e: any) {
    return { success: false, comments: [], message: String(e && e.message || e) };
  }
}

export function generateKcacComment(payload: any): CommentResult {
  try {
    payload = payload || {};
    const label = safeStr(payload.label || payload.patternType || "제출물");
    const type = safeStr(payload.type || "qual");
    const scores = payload.scores || {};
    const penalty = parseInt(payload.penalty, 10) || 0;
    if (penalty === 999) {
      const dq = `${label}은(는) 규정 시간을 초과해 실격 처리되었다. 작품 평가 이전에 시연 시간 요건을 충족하지 못했으므로, 타이머 운영과 제출 동선 관리가 우선 보완되어야 한다.`;
      return { success: true, comments: [dq, dq, dq] };
    }
    const items = Object.entries(scores).map(([key, value]) => ({ title: key, score: parseFloat(String(value)) })).filter((x) => !Number.isNaN(x.score));
    const average = items.length ? items.reduce((s, x) => s + x.score, 0) / items.length : 0;
    const strong = items.filter((x) => x.score >= 4).sort((a, b) => b.score - a.score);
    const refine = items.filter((x) => x.score < 3.5).sort((a, b) => a.score - b.score);
    const tags = flattenSmartTags(payload.smartTags || payload.tags || {});
    const domain = type === "final-sensory" ? "센서리와 프레젠테이션" : type === "final-pattern" ? "창작 패턴" : "규정 패턴";
    const overall = average >= 4.5 ? "대회 기준에서 완성도와 작품성이 매우 선명하게 드러난 제출물이다" :
      average >= 4 ? `${domain}의 핵심 요소를 안정적으로 구현한 제출물이다` :
      average >= 3.5 ? `${domain}의 기본 구조와 표현 의도가 안정적이나, 일부 디테일에서 추가 정리가 필요한 제출물이다` :
      average >= 3 ? "평가 기준의 기본 요건은 갖추었지만 완성도와 설득력을 더 끌어올릴 필요가 있는 제출물이다" :
      `${domain} 구현이 충분하지 않아 우선적인 기술 보완이 필요한 제출물이다`;
    const strength = strong.length ? `${strong.slice(0, 2).map((x) => x.title).join(", ")} 항목에서 강점이 확인된다.` : "두드러진 강점보다는 전반 요소의 균형을 기준으로 판단해야 한다.";
    const refinement = refine.length ? `${refine.slice(0, 2).map((x) => x.title).join(", ")} 항목은 보완 우선순위로 보인다.` : "큰 보완 요인은 제한적이며, 현재의 안정성을 유지하면서 마감 디테일을 정교하게 다듬는 방향이 적절하다.";
    const note = tags.length ? `선택된 스마트태그 기준으로 ${joinTags(tags, 3)} 관찰값이 확인되어 점수 외의 근거로 반영했다.` : "";
    const penaltySentence = penalty > 0 ? " 다만 시간 감점이 발생했으므로 시연 동선, 타이머 확인, 제출 시점 관리가 함께 보완되어야 한다." : "";
    const c1 = `${label} 기준으로 해당 잔은 ${overall}. ${strength} ${refinement} ${note}${penaltySentence}`;
    const c2 = `${label} 기준에서 해당 잔은 작품의 첫인상과 세부 완성도 사이의 연결을 기준으로 볼 때, ${overall}. 특히 ${strength} ${refinement} ${note}${penaltySentence}`;
    const c3 = `종합적으로 보면 ${label} 기준의 해당 잔은 KCAC 평가 기준에서 ${qual5Kcac(average)} 인상을 보인다. ${strength} ${refinement} ${average >= 3.5 ? "기본기는 확인되므로 다음 제출에서는 약점 항목을 좁혀 완성도의 일관성을 높이는 것이 중요하다." : "패턴 구조와 기본 품질을 먼저 안정화한 뒤 세부 표현을 확장하는 접근이 필요하다."} ${note}${penaltySentence}`;
    return { success: true, comments: [c1, c2, c3].map(tidyComment) };
  } catch (e: any) {
    return { success: false, comments: [], message: String(e && e.message || e) };
  }
}

export function generateMobComment(payload: any): CommentResult {
  try {
    payload = payload || {};
    const menu = safeStr(payload.menu || "브루잉");
    const techVals = payload.techVals || [];
    const sensVals = payload.sensVals || [];
    const sigVals = payload.sigVals || [];
    const totalScore = parseFloat(payload.totalScore) || 0;
    const techAvg = avg(techVals);
    const sensAvg = avg(sensVals);
    const sigAvg = sigVals.length ? avg(sigVals) : null;
    const techItems = metricItems("Technical", ["시연 전 작업대", "시연 중 작업대", "시연 후 작업대"], techVals);
    const sensItems = metricItems("Brewing", ["스윗니스", "플레이버", "균형", "클린컵", "질감", "시연 전문성"], sensVals);
    const sigItems = metricItems("Signature", ["형태와 용이성", "창작 향미", "균형", "질감", "전문성과 독창성"], sigVals);
    const allItems = [...techItems, ...sensItems, ...sigItems];
    const maxScore = (techVals.length + sensVals.length + sigVals.length) * 5;
    const ratio = maxScore ? totalScore / maxScore : 0;
    const summary = ratio >= 0.88 ? "전체적으로 MOB 기준에서 완성도와 전문성이 뚜렷하게 드러난 시연이었다." :
      ratio >= 0.78 ? "전반적인 흐름은 안정적이며, 강점이 명확하게 보이는 시연이었다." :
      ratio >= 0.65 ? "기본 구성은 갖췄으나 향미 표현과 서비스 디테일을 더 구체화할 필요가 있다." :
      "시연 흐름, 향미 완성도, 전달력 전반에서 우선순위를 정한 보완이 필요하다.";
    const tags = flattenSmartTags(payload.tags || {});
    const attr = safeStr(payload.attributeComments || "").replace(/\s+/g, " ").substring(0, 220);
    const strongest = sortItems(allItems, true);
    const weakest = sortItems(allItems, false);
    const c1 = `기술 영역은 평균 ${techAvg.toFixed(1)}점으로 ${band5(techAvg)} 수준이다. 브루잉 센서리 영역은 평균 ${sensAvg.toFixed(1)}점으로 ${band5(sensAvg)} 수준이다.${menu === "창작" && sigAvg != null ? ` 창작 음료는 평균 ${sigAvg.toFixed(1)}점으로 ${band5(sigAvg)} 수준이다.` : ""}${tags.length ? ` 선택된 MOB 포인트는 ${joinTags(tags, 7)}이며, 이 요소들이 코멘트의 핵심 근거가 된다.` : ""}${attr ? ` 세부 항목 코멘트의 "${attr}" 포인트가 점수 흐름과 함께 종합 인상에 반영된다.` : ""} ${summary}`;
    const c2 = `총점 ${totalScore.toFixed(1)}점 기준으로 보면 ${strongest.length ? itemList(strongest, 3, true) + "가 가장 돋보인다. " : "평가 항목 전반의 균형 확인이 필요하다. "}${weakest.length && weakest[0].score < 4 ? `다음 시연에서는 ${itemList(weakest, 2, true)}를 우선 보완하면 전체 완성도가 올라갈 수 있다. ` : "낮은 항목도 큰 흔들림 없이 관리되어, 현재 강점을 유지하면서 디테일을 정교하게 다듬는 방향이 적절하다. "}${summary}`;
    const c3 = `${sensItems.length ? `음료 표현은 ${qual5(sensAvg)} 수준이며, ${itemList(sortItems(sensItems, true), 2, false)}가 긍정적으로 읽힌다. ` : ""}${techItems.length ? `서비스 운영은 ${qual5(techAvg)} 수준으로, ${itemList(sortItems(techItems, true), 1, false)}에서 안정감이 보인다. ` : ""}${sigItems.length ? `창작 음료는 ${qual5(sigAvg || 0)} 완성도를 보이며, ${itemList(sortItems(sigItems, true), 2, false)}가 주요 인상이다. ` : ""}${weakest.length && weakest[0].score < 4 ? `보완 방향은 ${itemList(weakest, 2, true)}를 더 명확히 끌어올리는 것이다. ` : ""}${summary}`;
    return { success: true, comments: [c1, c2, c3].map(tidyComment) };
  } catch (e: any) {
    return { success: false, comments: [], message: String(e && e.message || e) };
  }
}

export function generateIkrcComment(payload: any): CommentResult {
  try {
    payload = payload || {};
    const sampleNo = safeStr(payload.sampleNo || "");
    const scores = payload.scores || {};
    const tags = payload.tags || {};
    const labels: Record<string, string> = { flavor: "Flavor", cleanCup: "Clean Cup", sweetness: "Sweetness", acidity: "Acidity", mouthfeel: "Mouthfeel" };
    const weights: Record<string, number> = { flavor: 3, cleanCup: 2, sweetness: 2, acidity: 1, mouthfeel: 2 };
    const order = ["flavor", "cleanCup", "sweetness", "acidity", "mouthfeel"];
    const vals = order.map((key) => {
      const value = parseFloat(scores[key]);
      return Number.isNaN(value) ? null : { key, label: labels[key], value, weighted: roundTotal(value * weights[key]) };
    }).filter(Boolean) as Array<{ key: string; label: string; value: number; weighted: number }>;
    if (!vals.length) return { success: true, comments: ["평가 항목 입력 후 코멘트를 생성해주세요."] };
    const sorted = vals.slice().sort((a, b) => b.weighted - a.weighted);
    const total = vals.reduce((sum, v) => sum + v.weighted, 0);
    const top = sorted.slice(0, 2).map((x) => x.label).join(", ");
    const low = vals.filter((x) => x.value < 6.5).slice(-2).map((x) => x.label).join(", ");
    const level = total >= 85 ? "매우 완성도 높은" : total >= 75 ? "완성도 있는" : total >= 65 ? "안정적인" : total >= 50 ? "기준은 충족하나 보완 여지가 있는" : "개선이 필요한";
    const cup = sampleNo ? `Sample ${sampleNo}은(는) ` : "해당 샘플은 ";
    const flTags = joinTags(flattenSmartTags(tags.flavor || []), 3);
    const ccTags = joinTags(flattenSmartTags(tags.cleanCup || []), 2);
    const swTags = joinTags(flattenSmartTags(tags.sweetness || []), 2);
    const acTags = joinTags(flattenSmartTags(tags.acidity || []), 2);
    const mfTags = joinTags(flattenSmartTags(tags.mouthfeel || []), 2);
    const lowText = low ? `${low} 항목은 표현의 선명도와 균형을 추가로 다듬을 필요가 있다.` : "뚜렷한 약점 없이 전반적으로 안정적인 인상을 남겼다.";
    const c1 = `${cup}${level} 로스팅 센서리 결과를 보였다. ${flTags ? `${flTags} 계열의 향미 표현이 확인되며, ` : ""}${top} 항목이 강점으로 확인된다. ${lowText}`;
    const c2 = `${cup}가중 총점 ${scoreText(total, 1)}점 수준으로, ${swTags ? `${swTags} 단맛이 구조를 받쳐주고, ` : ""}${acTags ? `${acTags} 산미가 컵의 방향성을 만든다. ` : ""}${ccTags ? `클린컵에서는 ${ccTags} 인상이 동반된다. ` : ""}${mfTags ? `마우스필은 ${mfTags} 질감으로 정리된다.` : ""} 전반적인 컵 밸런스는 ${total >= 65 ? "긍정적으로 평가된다." : "추가 보완이 권장된다."}`;
    const c3 = `${cup}${total >= 65 ? "향미 방향성과 컵 구조가 비교적 명확하다. " : "핵심 향미는 확인되나 구조적 완성도에서 보완이 필요하다. "}${low ? `${low}을 중심으로 로스팅 포인트와 후반부 인상을 조정하면 완성도를 높일 수 있다.` : "현재의 클린컵과 단맛 균형을 유지하는 것이 중요하다."}`;
    return { success: true, comments: [c1, c2, c3].map(tidyComment) };
  } catch (e: any) {
    return { success: false, comments: [], message: String(e && e.message || e) };
  }
}
