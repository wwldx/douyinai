const INVALID_DISH_NAMES = new Set([
  "unknown",
  "未知",
  "不确定",
  "无法识别",
  "无法判断",
  "看不清",
  "非食物",
  "不是食物",
  "未知菜品",
  "目标菜",
  "模型结果",
  "待确认",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function cleanList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    const text = cleanText(typeof raw === "string" ? raw : raw?.name || raw?.item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function isCredibleDishName(value) {
  const name = cleanText(value);
  if (!name || name.length > 40) return false;
  return !INVALID_DISH_NAMES.has(name.toLowerCase());
}

function stableOptionId(name) {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `vision-${(hash >>> 0).toString(36)}`;
}

function normalizeOption(option) {
  if (!option || typeof option !== "object" || !isCredibleDishName(option.name)) return null;
  const name = cleanText(option.name);
  const normalized = {
    id: stableOptionId(name),
    name,
    likelyIngredients: cleanList(option.likelyIngredients, 10),
    estimatedTime: cleanText(option.estimatedTime),
    difficulty: cleanText(option.difficulty),
    requiredTools: cleanList(option.requiredTools, 5),
    warnings: cleanList(option.warnings, 5),
    provenance: "vision",
  };
  if (
    normalized.likelyIngredients.length === 0
    || !normalized.estimatedTime
    || !normalized.difficulty
    || normalized.requiredTools.length === 0
  ) return null;
  return normalized;
}

function legacyPrimaryOption(result) {
  if (!isCredibleDishName(result?.dishName)) return null;
  return normalizeOption({
    name: result.dishName,
    likelyIngredients: result.likelyIngredients,
    estimatedTime: result.estimatedTime,
    difficulty: result.difficulty,
    requiredTools: result.requiredTools,
    warnings: result.warnings,
  });
}

export function normalizeTargetDishVisionContract(rawResult) {
  const result = rawResult && typeof rawResult === "object" ? rawResult : {};
  const hasNewContract = Array.isArray(result.dishOptions);
  const rawOptions = hasNewContract ? result.dishOptions : [legacyPrimaryOption(result)].filter(Boolean);
  const seenNames = new Set();
  const options = [];
  for (const rawOption of rawOptions) {
    const option = normalizeOption(rawOption);
    const key = option?.name.toLowerCase();
    if (!option || seenNames.has(key)) continue;
    seenNames.add(key);
    options.push(option);
    if (options.length >= 4) break;
  }

  const primary = options[0] || null;
  const primaryStillMatchesLegacy = primary
    && cleanText(primary.name).toLowerCase() === cleanText(result.dishName).toLowerCase();

  const normalized = {
    ...result,
    dishName: primary?.name || "",
    dishNameCandidates: options.slice(1).map((option) => option.name),
    dishOptions: options,
    likelyIngredients: primary?.likelyIngredients || [],
    optionalIngredients: primaryStillMatchesLegacy ? cleanList(result.optionalIngredients, 8) : [],
    requiredTools: primary?.requiredTools || [],
    estimatedTime: primary?.estimatedTime || "",
    difficulty: primary?.difficulty || "",
    warnings: primary?.warnings || cleanList(result.warnings, 5),
  };

  // 模型 usage 等元数据由不可枚举 Symbol 携带；归一化时必须保留，不能让审计记录变成 0 token。
  for (const symbol of Object.getOwnPropertySymbols(result)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, symbol);
    if (descriptor) Object.defineProperty(normalized, symbol, descriptor);
  }
  return normalized;
}

// 真实模型必须遵守 016 新候选契约；旧缓存的 legacy 兼容只允许留在 API 归一化层。
// 否则畸形模型响应会被清洗成空数组，前端会误报为“确实没有可信候选”。
export function normalizeTargetDishVisionModelResult(rawResult) {
  if (!rawResult || typeof rawResult !== "object" || !Array.isArray(rawResult.dishOptions)) {
    throw invalidModelContract("目标菜模型响应缺少 dishOptions 数组。");
  }
  const normalized = normalizeTargetDishVisionContract(rawResult);
  if (rawResult.dishOptions.length > 0 && normalized.dishOptions.length === 0) {
    throw invalidModelContract("目标菜模型返回了候选，但没有任何候选满足完整详情契约。");
  }
  return normalized;
}

function invalidModelContract(message) {
  const error = new Error(message);
  error.status = 502;
  error.code = "MODEL_RESPONSE_INVALID";
  return error;
}
