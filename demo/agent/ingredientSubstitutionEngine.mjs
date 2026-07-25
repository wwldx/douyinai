const ingredientAliases = [
  ["五花肉", ["五花肉"]],
  ["猪肉", ["猪里脊", "里脊肉", "猪瘦肉", "瘦肉", "猪肉片", "猪肉"]],
  ["鸡腿肉", ["鸡腿肉", "琵琶腿", "鸡腿"]],
  ["鸡胸肉", ["鸡胸肉", "鸡胸"]],
  ["鸡翅", ["鸡翅中", "翅中", "鸡翅"]],
  ["鸡肉", ["鸡肉"]],
  ["牛腩", ["牛腩"]],
  ["牛肉", ["牛里脊", "牛肉片", "牛肉"]],
  ["青椒", ["青椒"]],
  ["彩椒", ["彩椒", "甜椒"]],
  ["辣椒", ["尖椒", "杭椒", "辣椒"]],
  ["蒜苗", ["青蒜", "蒜苗"]],
  ["香菇", ["香菇"]],
  ["蘑菇", ["口蘑", "白蘑菇", "蘑菇", "菌菇"]],
  ["木耳", ["黑木耳", "木耳"]],
  ["番茄", ["西红柿", "番茄"]],
  ["番茄酱", ["番茄膏", "番茄酱"]],
  ["土豆", ["马铃薯", "土豆"]],
  ["胡萝卜", ["胡萝卜"]],
  ["黄瓜", ["黄瓜"]],
  ["豆腐", ["嫩豆腐", "老豆腐", "北豆腐", "南豆腐", "豆腐"]],
  ["鸡蛋", ["鸡蛋", "蛋"]],
  ["面条", ["挂面", "手擀面", "面条"]],
  ["意面", ["意大利面", "意面"]],
  ["米饭", ["剩米饭", "剩饭", "米饭"]],
  ["豆瓣酱", ["郫县豆瓣酱", "豆瓣酱"]],
  ["辣酱", ["辣椒酱", "香辣酱", "辣酱"]],
  ["花生", ["花生米", "花生"]],
  ["洋葱", ["洋葱"]],
  ["葱", ["小葱", "香葱", "大葱", "葱"]],
  ["大蒜", ["蒜瓣", "大蒜", "蒜"]],
  ["姜", ["生姜", "姜"]],
];

const substitutionRules = {
  五花肉: [
    { candidate: "猪肉", score: 82, reason: "可以保留猪肉香味", impact: "油脂和卷曲口感会弱一些，改成少油家常肉片版。" },
  ],
  猪肉: [
    { candidate: "五花肉", score: 90, reason: "仍是猪肉主料", impact: "成品会更油润，少放额外食用油。" },
  ],
  鸡腿肉: [
    { candidate: "鸡胸肉", score: 86, reason: "可以保留鸡肉主线", impact: "更容易变柴，缩短焖煮时间并切大块。" },
    { candidate: "鸡翅", score: 80, reason: "适合焖煮并能吸收汤汁", impact: "骨头占比更高，需要延长熟透时间。" },
    { candidate: "鸡肉", score: 78, reason: "仍可沿用鸡肉调味", impact: "先确认具体部位，再调整火候。" },
  ],
  鸡胸肉: [
    { candidate: "鸡腿肉", score: 90, reason: "同属鸡肉且更耐炒", impact: "成品更油润，熟透时间略长。" },
    { candidate: "鸡肉", score: 78, reason: "可以保留鸡肉主线", impact: "先确认具体部位，避免照搬原火候。" },
  ],
  鸡肉: [
    { candidate: "鸡腿肉", score: 94, reason: "是可直接使用的鸡肉部位", impact: "适合焖煮，注意完全熟透。" },
    { candidate: "鸡胸肉", score: 90, reason: "是可直接使用的鸡肉部位", impact: "缩短加热时间，避免口感变柴。" },
    { candidate: "鸡翅", score: 84, reason: "仍可沿用鸡肉调味", impact: "带骨，熟透时间和食用方式会变化。" },
  ],
  牛腩: [
    { candidate: "牛肉", score: 78, reason: "可以保留牛肉风味", impact: "普通牛肉不一定耐久炖，改成快炒或短炖版。" },
  ],
  牛肉: [
    { candidate: "牛腩", score: 82, reason: "仍是牛肉主料", impact: "牛腩需要更长时间，不适合直接照搬快炒火候。" },
  ],
  青椒: [
    { candidate: "彩椒", score: 92, reason: "形态和清脆口感接近", impact: "辣味会更弱、甜味更明显。" },
    { candidate: "辣椒", score: 80, reason: "可以保留椒香", impact: "辣度可能明显上升，先少量使用。" },
  ],
  彩椒: [
    { candidate: "青椒", score: 92, reason: "形态和口感接近", impact: "甜味减弱，椒味更明显。" },
  ],
  蒜苗: [
    { candidate: "葱", score: 72, reason: "可以补充葱香", impact: "缺少蒜苗的清脆和蒜香，只能做家常改版。" },
    { candidate: "洋葱", score: 66, reason: "可以补充甜香和配菜体积", impact: "风味变化较大，不能称为原配方。" },
  ],
  香菇: [
    { candidate: "蘑菇", score: 86, reason: "同为菌菇并能提供鲜味", impact: "香气和吸汁能力会变化。" },
  ],
  蘑菇: [
    { candidate: "香菇", score: 88, reason: "同为菌菇并能提供鲜味", impact: "香菇味更浓，用量可以少一点。" },
  ],
  番茄: [
    { candidate: "番茄酱", score: 62, reason: "能补充部分酸甜和颜色", impact: "缺少新鲜番茄的水分与块状口感，只适合少量调味。" },
  ],
  面条: [
    { candidate: "意面", score: 74, reason: "可以承担主食", impact: "煮制时间和酱汁挂附方式不同，改成意面版。" },
  ],
  意面: [
    { candidate: "面条", score: 70, reason: "可以承担主食", impact: "口感和酱汁结构会变化，改成拌面或汤面。" },
  ],
  豆瓣酱: [
    { candidate: "辣酱", score: 58, reason: "能补充部分辣味", impact: "缺少发酵豆香，需要少量酱油调味，不能当成等价替换。" },
  ],
};

const familyMatches = {
  鸡肉: new Set(["鸡腿肉", "鸡胸肉", "鸡翅", "鸡肉"]),
  猪肉: new Set(["五花肉", "猪肉"]),
  牛肉: new Set(["牛腩", "牛肉"]),
};

const aliasLookup = ingredientAliases
  .flatMap(([canonical, aliases]) => aliases.map((alias) => ({ canonical, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/[\s，。！？、,.!?；;（）()]+/g, "")
    .slice(0, 40);
}

function canonicalize(value) {
  const name = cleanName(value);
  if (!name) return { canonical: "", original: "" };

  const matched = aliasLookup.find(({ alias }) => name.includes(alias));
  if (matched) return { canonical: matched.canonical, original: String(value).trim() };

  return { canonical: name, original: String(value).trim() };
}

function inventoryNames(inventory) {
  return (Array.isArray(inventory) ? inventory : [])
    .map((item) => (typeof item === "string" ? item : item?.name))
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .slice(0, 32);
}

function exactCandidate(targetCanonical, candidateCanonical) {
  if (targetCanonical === candidateCanonical) return true;
  return familyMatches[targetCanonical]?.has(candidateCanonical) || false;
}

export function matchIngredientSubstitutes({ targetIngredient, inventory, targetDish = "" } = {}) {
  const selected = canonicalize(targetIngredient);
  if (!selected.canonical) throw Object.assign(new Error("缺少 targetIngredient。"), { status: 400 });

  const confirmedNames = inventoryNames(inventory);
  if (!confirmedNames.length) throw Object.assign(new Error("缺少用户确认后的 inventory。"), { status: 400 });

  const normalizedInventory = confirmedNames.map((name) => ({ ...canonicalize(name), name }));
  const exact = normalizedInventory.find((item) => exactCandidate(selected.canonical, item.canonical));
  const dishName = cleanName(targetDish) || "这道菜";
  const warnings = [
    "只比较用户确认保留的冰箱食材，不把模型未确认的识别结果算进来。",
    "替代建议不判断新鲜度、过期或是否可安全食用，食材状态仍需用户确认。",
  ];

  if (exact) {
    return {
      version: "allowlist-v1",
      selectedIngredient: selected.original,
      status: "exact_match",
      headline: `冰箱里有${exact.name}`,
      summary: `针对你从画面里选的${selected.original}，确认库存中已经有可用原料，可以直接接到${dishName}的规划里。`,
      exactMatch: exact.name,
      alternatives: [],
      shoppingSuggestion: null,
      warnings,
      evidence: {
        strategy: "deterministic_allowlist",
        targetCanonical: selected.canonical,
        comparedInventory: confirmedNames,
        matchedInventoryCanonical: exact.canonical,
      },
    };
  }

  const rules = substitutionRules[selected.canonical] || [];
  const alternatives = rules
    .map((rule) => {
      const matched = normalizedInventory.find((item) => item.canonical === rule.candidate);
      if (!matched) return null;
      return {
        inventoryItem: matched.name,
        score: rule.score,
        reason: rule.reason,
        impact: rule.impact,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (alternatives.length) {
    const best = alternatives[0];
    return {
      version: "allowlist-v1",
      selectedIngredient: selected.original,
      status: "adapt_recipe",
      headline: `可以用${best.inventoryItem}改做一版`,
      summary: `${best.reason}，但会改变原配方。系统会把这个变化明确带进${dishName}的做法，不把改版说成原菜。`,
      exactMatch: null,
      alternatives,
      shoppingSuggestion: null,
      warnings,
      evidence: {
        strategy: "deterministic_allowlist",
        targetCanonical: selected.canonical,
        comparedInventory: confirmedNames,
        candidateScores: alternatives.map(({ inventoryItem, score }) => ({ inventoryItem, score })),
      },
    };
  }

  return {
    version: "allowlist-v1",
    selectedIngredient: selected.original,
    status: "shop_needed",
    headline: `冰箱里暂时没有稳妥替代`,
    summary: `针对${selected.original}，当前白名单规则没有在确认库存中找到可靠替代。与其硬凑成另一道菜，更稳的是补买，或回到库存重新选一顿。`,
    exactMatch: null,
    alternatives: [],
    shoppingSuggestion: {
      item: selected.original,
      reason: `补上${selected.original}后，更容易保留${dishName}原本的口感和做法。`,
    },
    warnings,
    evidence: {
      strategy: "deterministic_allowlist",
      targetCanonical: selected.canonical,
      comparedInventory: confirmedNames,
      candidateScores: [],
    },
  };
}
