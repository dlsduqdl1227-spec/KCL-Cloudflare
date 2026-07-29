(function(global) {
  "use strict";

  var CATEGORY_ORDER = ["flavor", "aftertaste", "acidity", "sweetness", "mouthfeel"];
  var MAX_SELECTIONS = { flavor: 5, mouthfeel: 3, acidity: 3, sweetness: 3, aftertaste: 3 };
  var CATEGORY_LABELS = {
    flavor: { ko: "플레이버", en: "Flavor" },
    aftertaste: { ko: "에프터테이스트", en: "Aftertaste" },
    acidity: { ko: "산미", en: "Acidity" },
    sweetness: { ko: "단맛", en: "Sweetness" },
    mouthfeel: { ko: "마우스필", en: "Mouthfeel" }
  };
  var FAMILY_ORDER = {
    flavor: ["floral", "citrus", "berry", "stone_fruit", "pome", "tropical", "grape_dried_fruit", "sweet", "nutty_cocoa", "tea_herbal", "spice", "grain_roasted", "fermented", "improvement"],
    mouthfeel: ["primary", "improvement"],
    acidity: ["primary", "improvement"],
    sweetness: ["primary"],
    aftertaste: ["primary", "improvement"]
  };
  var FAMILY_LABELS = {
    floral: { ko: "꽃 계열", en: "Floral" },
    citrus: { ko: "시트러스 계열", en: "Citrus" },
    berry: { ko: "베리 계열", en: "Berry" },
    stone_fruit: { ko: "핵과류 계열", en: "Stone Fruit" },
    pome: { ko: "사과·배 계열", en: "Apple & Pear" },
    tropical: { ko: "열대과일 계열", en: "Tropical Fruit" },
    grape_dried_fruit: { ko: "포도·건과일 계열", en: "Grape & Dried Fruit" },
    sweet: { ko: "단 향미 계열", en: "Sweet" },
    nutty_cocoa: { ko: "견과·코코아 계열", en: "Nutty & Cocoa" },
    tea_herbal: { ko: "차·허브 계열", en: "Tea & Herbal" },
    spice: { ko: "향신료 계열", en: "Spice" },
    grain_roasted: { ko: "곡물·로스티드 계열", en: "Grain & Roasted" },
    fermented: { ko: "발효 계열", en: "Fermented" },
    primary: { ko: "주요 표현", en: "Primary" },
    improvement: { ko: "보완 표현", en: "Refinement" }
  };

  var tags = [];
  var orderByCategory = {};
  function add(category, group, family, values) {
    orderByCategory[category] = orderByCategory[category] || 0;
    values.forEach(function(value) {
      orderByCategory[category] += 1;
      tags.push({
        id: value[0],
        category: category,
        group: group,
        family: family,
        labelKo: value[1],
        labelEn: value[2],
        order: orderByCategory[category],
        isActive: true
      });
    });
  }

  add("flavor", "primary", "floral", [
    ["flavor_floral_jasmine", "재스민", "Jasmine"],
    ["flavor_floral_rose", "장미", "Rose"],
    ["flavor_floral_chamomile", "캐모마일", "Chamomile"],
    ["flavor_floral_lavender", "라벤더", "Lavender"],
    ["flavor_floral_orange_blossom", "오렌지 블라섬", "Orange Blossom"]
  ]);
  add("flavor", "primary", "citrus", [
    ["flavor_citrus_lemon", "레몬", "Lemon"],
    ["flavor_citrus_lime", "라임", "Lime"],
    ["flavor_citrus_orange", "오렌지", "Orange"],
    ["flavor_citrus_grapefruit", "자몽", "Grapefruit"],
    ["flavor_citrus_bergamot", "베르가못", "Bergamot"]
  ]);
  add("flavor", "primary", "berry", [
    ["flavor_berry_strawberry", "딸기", "Strawberry"],
    ["flavor_berry_raspberry", "라즈베리", "Raspberry"],
    ["flavor_berry_blueberry", "블루베리", "Blueberry"],
    ["flavor_berry_blackberry", "블랙베리", "Blackberry"]
  ]);
  add("flavor", "primary", "stone_fruit", [
    ["flavor_stone_fruit_peach", "복숭아", "Peach"],
    ["flavor_stone_fruit_apricot", "살구", "Apricot"],
    ["flavor_stone_fruit_plum", "자두", "Plum"],
    ["flavor_stone_fruit_cherry", "체리", "Cherry"]
  ]);
  add("flavor", "primary", "pome", [
    ["flavor_pome_apple", "사과", "Apple"],
    ["flavor_pome_pear", "배", "Pear"]
  ]);
  add("flavor", "primary", "tropical", [
    ["flavor_tropical_pineapple", "파인애플", "Pineapple"],
    ["flavor_tropical_mango", "망고", "Mango"],
    ["flavor_tropical_passion_fruit", "패션프루트", "Passion Fruit"],
    ["flavor_tropical_banana", "바나나", "Banana"]
  ]);
  add("flavor", "primary", "grape_dried_fruit", [
    ["flavor_grape_grape", "포도", "Grape"],
    ["flavor_dried_fruit_raisin", "건포도", "Raisin"],
    ["flavor_dried_fruit_date", "대추", "Date"],
    ["flavor_dried_fruit_prune", "말린 자두", "Prune"]
  ]);
  add("flavor", "primary", "sweet", [
    ["flavor_sweet_sugar", "설탕", "Sugar"],
    ["flavor_sweet_brown_sugar", "황설탕", "Brown Sugar"],
    ["flavor_sweet_honey", "꿀", "Honey"],
    ["flavor_sweet_caramel", "캐러멜", "Caramel"],
    ["flavor_sweet_molasses", "당밀", "Molasses"],
    ["flavor_sweet_maple_syrup", "메이플 시럽", "Maple Syrup"],
    ["flavor_sweet_vanilla", "바닐라", "Vanilla"]
  ]);
  add("flavor", "primary", "nutty_cocoa", [
    ["flavor_nutty_almond", "아몬드", "Almond"],
    ["flavor_nutty_hazelnut", "헤이즐넛", "Hazelnut"],
    ["flavor_nutty_walnut", "호두", "Walnut"],
    ["flavor_nutty_roasted_nut", "구운 견과류", "Roasted Nut"],
    ["flavor_cocoa_cacao", "카카오", "Cacao"],
    ["flavor_cocoa_milk_chocolate", "밀크초콜릿", "Milk Chocolate"],
    ["flavor_cocoa_dark_chocolate", "다크초콜릿", "Dark Chocolate"]
  ]);
  add("flavor", "primary", "tea_herbal", [
    ["flavor_tea_black_tea", "홍차", "Black Tea"],
    ["flavor_tea_green_tea", "녹차", "Green Tea"],
    ["flavor_tea_earl_grey", "얼그레이", "Earl Grey"],
    ["flavor_herbal_herbal", "허브", "Herbal"],
    ["flavor_herbal_mint", "민트", "Mint"]
  ]);
  add("flavor", "primary", "spice", [
    ["flavor_spice_cinnamon", "시나몬", "Cinnamon"],
    ["flavor_spice_clove", "정향", "Clove"],
    ["flavor_spice_black_pepper", "후추", "Black Pepper"]
  ]);
  add("flavor", "primary", "grain_roasted", [
    ["flavor_grain_biscuit", "비스킷", "Biscuit"],
    ["flavor_grain_bread", "빵", "Bread"],
    ["flavor_roasted_toast", "토스트", "Toast"],
    ["flavor_grain_cereal", "곡물", "Cereal"],
    ["flavor_grain_malt", "맥아", "Malt"]
  ]);
  add("flavor", "primary", "fermented", [
    ["flavor_fermented_wine", "와인", "Wine-like"],
    ["flavor_fermented_fruit", "발효 과일", "Fermented Fruit"],
    ["flavor_fermented_rum", "럼", "Rum-like"],
    ["flavor_fermented_yogurt", "요거트", "Yogurt-like"]
  ]);
  add("flavor", "improvement", "improvement", [
    ["flavor_improvement_grassy", "풀", "Grassy"],
    ["flavor_improvement_raw", "생두", "Raw"],
    ["flavor_improvement_woody", "나무", "Woody"],
    ["flavor_improvement_earthy", "흙", "Earthy"],
    ["flavor_improvement_papery", "종이", "Papery"],
    ["flavor_improvement_smoky", "연기", "Smoky"],
    ["flavor_improvement_burnt", "탄 맛", "Burnt"],
    ["flavor_improvement_rubber", "고무", "Rubber"],
    ["flavor_improvement_medicinal", "약품", "Medicinal"],
    ["flavor_improvement_metallic", "금속", "Metallic"],
    ["flavor_improvement_over_fermented", "과발효", "Over-fermented"],
    ["flavor_improvement_moldy", "곰팡이", "Moldy"]
  ]);

  add("mouthfeel", "primary", "primary", [
    ["mouthfeel_tea_like", "차 같은", "Tea-like"],
    ["mouthfeel_smooth", "매끄러운", "Smooth"],
    ["mouthfeel_silky", "실키한", "Silky"],
    ["mouthfeel_creamy", "크리미한", "Creamy"],
    ["mouthfeel_syrupy", "시럽 같은", "Syrupy"],
    ["mouthfeel_juicy", "과즙감 있는", "Juicy"],
    ["mouthfeel_round", "둥근", "Round"],
    ["mouthfeel_dense", "밀도감 있는", "Dense"],
    ["mouthfeel_coating", "코팅감 있는", "Coating"],
    ["mouthfeel_oily", "오일리한", "Oily"]
  ]);
  add("mouthfeel", "improvement", "improvement", [
    ["mouthfeel_watery", "묽은", "Watery"],
    ["mouthfeel_rough", "거친", "Rough"],
    ["mouthfeel_grainy", "입자감 있는", "Grainy"],
    ["mouthfeel_powdery", "분말감 있는", "Powdery"],
    ["mouthfeel_dry", "드라이한", "Dry"],
    ["mouthfeel_astringent", "수렴감 있는", "Astringent"],
    ["mouthfeel_pasty", "텁텁한", "Pasty"],
    ["mouthfeel_uneven", "불균일한", "Uneven"]
  ]);

  add("acidity", "primary", "primary", [
    ["acidity_lemon_like", "레몬 같은", "Lemon-like"],
    ["acidity_lime_like", "라임 같은", "Lime-like"],
    ["acidity_orange_like", "오렌지 같은", "Orange-like"],
    ["acidity_grapefruit_like", "자몽 같은", "Grapefruit-like"],
    ["acidity_apple_like", "사과 같은", "Apple-like"],
    ["acidity_pear_like", "배 같은", "Pear-like"],
    ["acidity_grape_like", "포도 같은", "Grape-like"],
    ["acidity_berry_like", "베리 같은", "Berry-like"],
    ["acidity_cherry_like", "체리 같은", "Cherry-like"],
    ["acidity_tropical_fruit_like", "열대과일 같은", "Tropical-fruit-like"],
    ["acidity_yogurt_like", "요거트 같은", "Yogurt-like"],
    ["acidity_wine_like", "와인 같은", "Wine-like"]
  ]);
  add("acidity", "improvement", "improvement", [
    ["acidity_vinegar_like", "식초 같은", "Vinegar-like"],
    ["acidity_unripe_fruit_like", "덜 익은 과일 같은", "Unripe-fruit-like"],
    ["acidity_sour_candy_like", "신 사탕 같은", "Sour-candy-like"]
  ]);

  add("sweetness", "primary", "primary", [
    ["sweetness_sugar_like", "설탕 같은", "Sugar-like"],
    ["sweetness_cane_sugar_like", "사탕수수 같은", "Cane-sugar-like"],
    ["sweetness_brown_sugar_like", "황설탕 같은", "Brown-sugar-like"],
    ["sweetness_honey_like", "꿀 같은", "Honey-like"],
    ["sweetness_caramel_like", "캐러멜 같은", "Caramel-like"],
    ["sweetness_molasses_like", "당밀 같은", "Molasses-like"],
    ["sweetness_maple_syrup_like", "메이플 시럽 같은", "Maple-syrup-like"],
    ["sweetness_vanilla_like", "바닐라 같은", "Vanilla-like"],
    ["sweetness_milk_chocolate_like", "밀크초콜릿 같은", "Milk-chocolate-like"],
    ["sweetness_dark_chocolate_like", "다크초콜릿 같은", "Dark-chocolate-like"],
    ["sweetness_ripe_fruit_like", "잘 익은 과일 같은", "Ripe-fruit-like"],
    ["sweetness_dried_fruit_like", "말린 과일 같은", "Dried-fruit-like"],
    ["sweetness_malt_like", "맥아 같은", "Malt-like"],
    ["sweetness_biscuit_like", "비스킷 같은", "Biscuit-like"]
  ]);

  add("aftertaste", "primary", "primary", [
    ["aftertaste_sweet", "달콤한", "Sweet"],
    ["aftertaste_clean", "깔끔한", "Clean"],
    ["aftertaste_aromatic", "향긋한", "Aromatic"],
    ["aftertaste_smooth", "부드러운", "Smooth"],
    ["aftertaste_tea_like", "차 같은", "Tea-like"],
    ["aftertaste_chocolate_like", "초콜릿 같은", "Chocolate-like"],
    ["aftertaste_caramel_like", "캐러멜 같은", "Caramel-like"],
    ["aftertaste_nutty", "견과류 같은", "Nutty"],
    ["aftertaste_spicy", "향신료 같은", "Spicy"],
    ["aftertaste_roasted", "로스티드한", "Roasted"]
  ]);
  add("aftertaste", "improvement", "improvement", [
    ["aftertaste_bitter", "쓴맛이 남는", "Bitter"],
    ["aftertaste_dry", "드라이한", "Dry"],
    ["aftertaste_astringent", "수렴감 있는", "Astringent"],
    ["aftertaste_rough", "거친", "Rough"],
    ["aftertaste_pasty", "텁텁한", "Pasty"],
    ["aftertaste_smoky", "연기 같은", "Smoky"],
    ["aftertaste_burnt", "탄 맛이 남는", "Burnt"],
    ["aftertaste_woody", "나무 같은", "Woody"],
    ["aftertaste_papery", "종이 같은", "Papery"],
    ["aftertaste_metallic", "금속 같은", "Metallic"],
    ["aftertaste_hollow", "비어 있는", "Hollow"]
  ]);

  var byId = {};
  tags.forEach(function(tag) { byId[tag.id] = tag; });

  function uniqueIds(ids) {
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function(id) {
      id = String(id || "").trim();
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }
  function sanitize(ids, category) {
    return uniqueIds(ids).filter(function(id) {
      var tag = byId[id];
      return !!(tag && tag.isActive && tag.category === category);
    });
  }
  function maxMessage(category) {
    return category === "flavor"
      ? "대표적인 플레이버는 최대 5개까지 선택할 수 있습니다."
      : "대표적인 특성은 최대 3개까지 선택할 수 있습니다.";
  }
  function toggle(ids, id, category, otherSelectionCount) {
    var selected = sanitize(ids, category);
    var tag = byId[String(id || "")];
    if (!tag || !tag.isActive || tag.category !== category) {
      return { success: false, selected: selected, message: "현재 평가 항목에 사용할 수 없는 태그입니다." };
    }
    var currentIndex = selected.indexOf(tag.id);
    if (currentIndex > -1) {
      selected.splice(currentIndex, 1);
      return { success: true, selected: selected, removed: true, message: "" };
    }
    var max = MAX_SELECTIONS[category] || 3;
    if (selected.length + Math.max(0, Number(otherSelectionCount) || 0) >= max) {
      return { success: false, selected: selected, message: maxMessage(category) };
    }
    selected.push(tag.id);
    return { success: true, selected: selected, removed: false, message: "" };
  }
  function list(category, family) {
    return tags.filter(function(tag) {
      return tag.isActive && (!category || tag.category === category) && (!family || tag.family === family);
    }).sort(function(a, b) { return a.order - b.order; });
  }
  function families(category) {
    return (FAMILY_ORDER[category] || []).filter(function(family) { return list(category, family).length > 0; });
  }
  function labels(ids) {
    return uniqueIds(ids).map(function(id) { return byId[id]; }).filter(Boolean).map(function(tag) { return tag.labelKo; });
  }
  function syncAftertasteFlavorRefs(flavorTagIds, aftertasteFlavorTagIds) {
    var allowed = sanitize(flavorTagIds, "flavor");
    return uniqueIds(aftertasteFlavorTagIds).filter(function(id) { return allowed.indexOf(id) > -1; });
  }

  global.KCR_SENSORY_TAGS = tags;
  global.KCR_SENSORY_CONFIG = {
    categoryOrder: CATEGORY_ORDER,
    categoryLabels: CATEGORY_LABELS,
    familyOrder: FAMILY_ORDER,
    familyLabels: FAMILY_LABELS,
    maxSelections: MAX_SELECTIONS
  };
  global.KcrSensoryTags = {
    get: function(id) { return byId[String(id || "")] || null; },
    list: list,
    families: families,
    labels: labels,
    sanitize: sanitize,
    toggle: toggle,
    maxMessage: maxMessage,
    syncAftertasteFlavorRefs: syncAftertasteFlavorRefs
  };
})(typeof window !== "undefined" ? window : globalThis);
