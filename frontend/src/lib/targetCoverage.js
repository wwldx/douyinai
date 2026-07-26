export const targetIngredientAliases = {
  鸡腿肉: ["鸡腿肉", "鸡肉", "鸡胸肉", "鸡腿", "鸡翅"],
  鸡肉: ["鸡肉", "鸡腿肉", "鸡胸肉", "鸡腿"],
  五花肉: ["五花肉", "猪肉", "肉片"],
  牛腩: ["牛腩", "牛肉"],
  青椒: ["青椒", "彩椒", "甜椒", "辣椒"],
  蒜苗: ["蒜苗", "青蒜", "大蒜"],
  葱: ["葱", "小葱", "香葱", "大葱"],
  姜: ["姜", "生姜"],
  蒜: ["蒜", "大蒜"],
  豆瓣酱: ["豆瓣酱", "辣酱"],
  醋: ["醋", "陈醋", "米醋", "香醋"],
  白糖: ["白糖", "糖"],
  花生: ["花生", "花生米"],
  木耳: ["木耳", "黑木耳"],
  鸡翅: ["鸡翅", "翅中", "鸡肉"],
  香菇: ["香菇", "蘑菇", "菌菇"],
  土豆: ["土豆", "马铃薯"],
  番茄: ["番茄", "西红柿"],
  米饭: ["米饭", "剩饭"],
  羊肉: ["羊肉", "羊肉片", "羊排"],
  烩面片: ["烩面片", "烩面", "宽面片", "宽面"],
  香菜: ["香菜", "芫荽"],
};

function clean(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

export function findIngredientMatch(ingredient, inventory) {
  const names = (Array.isArray(inventory) ? inventory : [])
    .map((item) => clean(typeof item === "string" ? item : item?.name))
    .filter(Boolean);
  const candidates = targetIngredientAliases[ingredient] || [clean(ingredient)];
  return names.find((name) => candidates.some((candidate) => name.includes(candidate) || candidate.includes(name))) || "";
}

export function resolveRequiredCoverage(requiredItems, inventory) {
  const availableItems = [];
  const missingCritical = [];
  for (const requiredItem of Array.isArray(requiredItems) ? requiredItems : []) {
    const matched = findIngredientMatch(requiredItem, inventory);
    if (matched) availableItems.push(matched);
    else missingCritical.push(requiredItem);
  }
  return {
    availableItems: [...new Set(availableItems)],
    missingCritical,
    coverageStatus: missingCritical.length ? "missing" : "enough",
  };
}

export function deriveUnknownCoverageStatus(missingItems) {
  const specificMissing = (Array.isArray(missingItems) ? missingItems : [])
    .map(clean)
    .filter((item) => item && !/^(关键|主要|核心)?主料$/.test(item));
  return specificMissing.length ? "missing" : "unresolved";
}
