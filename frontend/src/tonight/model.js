// 阶段 1 状态模型：常量、来源语义、文案、兜底方案与持久化

export const SAMPLE_DISH = {
  url: "/demo-assets/菜/黄焖鸡-示例.png",
  fileName: "黄焖鸡-示例.png",
  demoKey: "sample-dish-huangmenji",
  post: { author: "@阿强的深夜灶台", caption: "汤汁拌饭能吃三碗的黄焖鸡，砂锅一上桌全屋都香了", likes: "12.4w" },
};

export const SAMPLE_FRIDGE = {
  url: "/demo-assets/fridge-images/f63de1c0794c76a412b9f06f0d919044.png",
  fileName: "f63de1c0794c76a412b9f06f0d919044.png",
  demoKey: "sample-fridge-01",
};

// 示例翻车图：只用于与当前晚餐方案无关的独立演示，症状与缓存 requestSignature 严格对应
export const SAMPLE_RESCUES = [
  {
    key: "sample-rescue-watery",
    url: "/demo-assets/dish-rescue/tomato-eggs-too-watery-demo.png",
    fileName: "tomato-eggs-too-watery-demo.png",
    dishName: "番茄炒蛋",
    symptomLabel: "汤太多",
    category: "state",
    symptom: "太稀",
  },
  {
    key: "sample-rescue-scorched",
    url: "/demo-assets/dish-rescue/chicken-stir-fry-scorched-demo.png",
    fileName: "chicken-stir-fry-scorched-demo.png",
    dishName: "干锅鸡块",
    symptomLabel: "炒糊了",
    category: "state",
    symptom: "粘锅/糊锅",
  },
];

// 常见现场症状：单选，category/symptom 与后端救援契约一致
export const RESCUE_SYMPTOMS = [
  { key: "scorched", label: "粘锅 / 糊了", category: "state", symptom: "粘锅/糊锅" },
  { key: "watery", label: "汤太多 / 太稀", category: "state", symptom: "太稀" },
  { key: "dry", label: "太干 / 快烧干", category: "state", symptom: "太干" },
  { key: "salty", label: "太咸", category: "taste", symptom: "太咸" },
  { key: "bland", label: "太淡", category: "taste", symptom: "太淡" },
  { key: "seasoning", label: "调料不知怎么补", category: "seasoning", symptom: "不知道怎么补调料" },
  { key: "lost", label: "不知道下一步", category: "next_step", symptom: "不知道下一步" },
];

export function rescueSymptomByKey(key) {
  return RESCUE_SYMPTOMS.find((option) => option.key === key) || null;
}

export const TIME_OPTIONS = [
  { id: "15", label: "只剩 15 分钟", value: "15 分钟", minutes: 15 },
  { id: "25", label: "25 分钟左右", value: "25 分钟", minutes: 25 },
  { id: "40", label: "40 分钟也行", value: "40 分钟", minutes: 40 },
  { id: "flexible", label: "今晚不赶时间", value: "不限", minutes: null },
];

export const TIME_QUESTION = "从备菜到出锅，你今晚愿意留多久？";

export function timeOptionById(id) {
  return TIME_OPTIONS.find((t) => t.id === id) || null;
}

// 五类反馈：正合适只记录；其余形成下一次规划约束并生成新版本
export const FEEDBACK_OPTIONS = [
  { type: "fit", label: "正合适", recordOnly: true },
  {
    type: "too_complex",
    label: "太麻烦",
    preferences: ["更少步骤", "新手可执行"],
    avoid: ["复杂步骤", "长时间备菜"],
    goal: "上一版太麻烦，这一轮必须明显降低步骤和操作难度",
  },
  {
    type: "too_many_missing",
    label: "缺料太多",
    preferences: ["优先只用现有库存"],
    avoid: ["额外补买", "依赖缺失主料"],
    goal: "上一版缺料太多，这一轮优先用已经确认的食材完成一餐",
  },
  {
    type: "low_cleanup",
    label: "不想洗锅",
    preferences: ["少洗锅", "一锅完成"],
    avoid: ["多锅并行", "复杂清洗"],
    goal: "上一版清洗负担太高，这一轮优先一锅完成",
  },
  {
    type: "lighter_taste",
    label: "换清淡点",
    preferences: ["清淡", "少油"],
    avoid: ["重油", "重辣"],
    goal: "上一版口味偏重，这一轮需要更清淡少油",
  },
];

export function feedbackOptionByType(type) {
  return FEEDBACK_OPTIONS.find((o) => o.type === type) || null;
}

// ---------- 素材来源（三级制，与计算来源严格分开） ----------

export function imageSourceLabel(source) {
  if (source === "sample") return "示例";
  if (source === "last-inventory") return "上次库存";
  if (source === "manual") return "手动填写";
  return "实拍";
}

// 整会话素材标注：全部示例 → 示例演示；混用 → 含示例素材；全部真实 → 无标记
export function sessionSourceBadge(sources) {
  const real = sources.filter(Boolean);
  if (!real.length) return null;
  const samples = real.filter((s) => s === "sample").length;
  if (samples === real.length) return "示例演示";
  if (samples > 0) return "含示例素材";
  return null;
}

// 只有明确使用固定示例预分析时才向用户说明
export function isFixedDemoResult(computeSource, materialSource) {
  return materialSource === "sample" && typeof computeSource === "string" && computeSource.includes("cache");
}

// ---------- 名称匹配 ----------

export function normalizeName(name) {
  return String(name || "").replace(/[\s·、，,（）()]/g, "").trim();
}

export function namesMatch(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
}

export function itemDisplayName(item) {
  if (typeof item === "string") return item;
  return String(item?.name || item?.item || "").trim();
}

// ---------- 先吃标记（只来自用户主动确认，不从照片推断） ----------

// 标记形状：{ [name]: { opened, labelSoon, unsure } }
// opened 与 labelSoon 可同时成立；unsure 与两者互斥
export function eatFirstItemStatesFromMarks(marks, names) {
  if (!marks || !Array.isArray(names)) return [];
  return names
    .map((name) => {
      const mark = marks[name];
      if (!mark) return null;
      if (mark.unsure) return { name, status: "unknown" };
      if (mark.opened && mark.labelSoon) return { name, status: "opened_label_soon" };
      if (mark.opened) return { name, status: "opened" };
      if (mark.labelSoon) return { name, status: "label_soon" };
      return null;
    })
    .filter(Boolean);
}

export function eatFirstMarkedCount(marks) {
  return Object.values(marks || {}).filter((m) => m && (m.opened || m.labelSoon || m.unsure)).length;
}

// ---------- userContext（沿用现有后端契约） ----------

export function buildUserContext({ timeBudget, note = "", feedbackType = null, alternative = false, eatFirstPriorities = [], alternativeFrom = null }) {
  const option = feedbackOptionByType(feedbackType);
  const preferences = [];
  const avoid = [];
  let goal = "晚餐：给出今晚现实可做的一顿饭";
  if (option && !option.recordOnly) {
    preferences.push(...option.preferences);
    avoid.push(...option.avoid);
    goal += `；${option.goal}`;
  }
  if (eatFirstPriorities.length) {
    const priorityText = `本餐优先处理：${eatFirstPriorities.join("、")}`;
    preferences.push(priorityText);
    goal += `；用户主动确认${priorityText}`;
  }
  if (alternativeFrom?.candidateName) {
    preferences.push(`参考上一版的思路「${alternativeFrom.candidateName}」`);
    goal += `；用户想参考上一版的另一个思路「${alternativeFrom.candidateName}」${alternativeFrom.candidateWhy ? `（${alternativeFrom.candidateWhy}）` : ""}，给出一版新方案；仍以现实库存为准，不必坚持原候选菜`;
  } else if (alternative) {
    preferences.push("与上一版不同但同样可执行");
    goal += "；同时给出与上一版不同的可执行版本";
  }
  if (note) {
    preferences.push(note);
    goal += `；用户补充：${note}`;
  }
  return {
    user: {
      name: "展示用户",
      cookingLevel: "新手",
      preferences: [...new Set(preferences)],
      avoid: [...new Set(avoid)],
      recentMeals: [],
      goal,
    },
    context: {
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      mealSlot: "晚餐",
      availableCookingTime: timeBudget ? timeBudget.value : "由用户确认",
      timeBudgetId: timeBudget ? timeBudget.id : "",
      energyLevel: "由用户确认",
      nextSchedule: "由用户确认",
    },
  };
}

// ---------- 兜底（明确标注，绝不冒充实时模型成功） ----------

export function fallbackDinnerPlan(inventory, timeBudget) {
  const names = inventory.map(itemDisplayName).filter(Boolean).slice(0, 6);
  const main = names.slice(0, 3);
  return {
    decision: "simple_cook",
    summary: `模型暂时不可用，这是一版保守规则方案：用你确认的${main.join("、") || "现有食材"}做最简单的热食，等模型恢复后可以重新规划。`,
    baseMeal: {
      name: main.length ? "现有食材保守处理" : "先核对现有食材",
      why: "规则兜底只帮你缩小范围，不根据任意食材拼出未经判断的菜谱。",
      timeCost: timeBudget?.value && timeBudget.value !== "不限" ? timeBudget.value : "15-20 分钟",
      difficulty: "新手友好",
      requiredItems: main,
      steps: [
        `先逐项确认${main.join("、") || "现有食材"}的种类、状态和是否适合今天使用。`,
        "只处理你熟悉且能确认安全做法的食材；生肉、剩菜和状态不明的食材不要套用通用步骤。",
        "优先选择包装说明明确的速食、已确认可直接食用的食材，或等模型恢复后重新规划。",
      ],
      safetyTips: ["肉类和剩菜必须彻底热透；食材新鲜度以你自己检查为准。"],
    },
    stretchMeal: { name: "", why: "", extraSkill: "", timeCost: "" },
    shoppingUpgrade: { neededItems: [], reason: "", estimatedCost: "" },
    fallback: { type: "simple_cook", condition: "模型恢复后", suggestion: "重新生成完整方案。" },
    commerceSuggestion: { type: "none", title: "", item: "", reason: "" },
  };
}

export function fallbackTargetPlan(dishName, inventory, timeBudget) {
  const names = inventory.map(itemDisplayName).filter(Boolean);
  return {
    targetDish: {
      name: dishName || "想吃的菜",
      intentTime: "tonight",
      coreTaste: "按你想吃的口味来",
      estimatedTime: timeBudget?.value && timeBudget.value !== "不限" ? timeBudget.value : "30-40 分钟",
      difficulty: "未知",
    },
    verdict: {
      title: "模型暂时不可用，先给你保守判断",
      summary: "这是一版规则兜底，不是本次模型结果：先核对主料，缺主料时不要硬凑；等模型恢复后重新判断会更准。",
      primaryAction: "cook_simplified",
    },
    inventoryMatch: {
      availableItems: names,
      missingCritical: [],
      missingOptional: [],
      substitutions: [],
      coverageStatus: "unresolved",
      needsConfirmationItems: ["这道菜的关键主料"],
    },
    shoppingPlan: { mustBuy: [], confirmAtHome: ["食用油", "盐", "酱油"], optionalUpgrades: [] },
    executionPlan: {
      recommendedVersion: "先确认主料够不够，缺主料时不要硬凑成另一道菜。",
      steps: ["确认这道菜最重要的主料。", "核对冰箱里已有材料。", "缺主料时先补买，或改做相近口味的热食。", "按你确认的时间控制步骤复杂度。"],
      difficultyWarnings: ["当前是保守兜底方案，关键材料还需要你确认。"],
      prepForTomorrow: "",
    },
    userFit: { skillNote: "", timeNote: "", profileNotes: [] },
    commerceCards: [],
  };
}

// ---------- 方案归一化 ----------

const dinnerDefaults = {
  decision: "",
  summary: "",
  baseMeal: { name: "", why: "", timeCost: "", difficulty: "", requiredItems: [], steps: [], safetyTips: [] },
  stretchMeal: { name: "", why: "", extraSkill: "", timeCost: "" },
  shoppingUpgrade: { neededItems: [], reason: "", estimatedCost: "" },
  fallback: { type: "", condition: "", suggestion: "" },
  commerceSuggestion: { type: "none", title: "", item: "", reason: "" },
};

export function normalizeDinnerPlan(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  return {
    ...dinnerDefaults,
    ...p,
    baseMeal: { ...dinnerDefaults.baseMeal, ...p.baseMeal },
    stretchMeal: { ...dinnerDefaults.stretchMeal, ...p.stretchMeal },
    shoppingUpgrade: { ...dinnerDefaults.shoppingUpgrade, ...p.shoppingUpgrade },
    fallback: { ...dinnerDefaults.fallback, ...p.fallback },
    commerceSuggestion: { ...dinnerDefaults.commerceSuggestion, ...p.commerceSuggestion },
  };
}

const targetDefaults = {
  targetDish: { name: "想吃的菜", intentTime: "tonight", coreTaste: "", estimatedTime: "", difficulty: "" },
  verdict: { title: "", summary: "", primaryAction: "" },
  inventoryMatch: {
    availableItems: [],
    missingCritical: [],
    missingOptional: [],
    substitutions: [],
    coverageStatus: "unresolved",
    needsConfirmationItems: [],
  },
  shoppingPlan: { mustBuy: [], confirmAtHome: [], optionalUpgrades: [] },
  executionPlan: { recommendedVersion: "", steps: [], difficultyWarnings: [], prepForTomorrow: "" },
  userFit: { skillNote: "", timeNote: "", profileNotes: [] },
  commerceCards: [],
};

function nameList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(itemDisplayName).filter(Boolean).slice(0, 10);
}

function buyList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? { item: entry, reason: "" } : { item: itemDisplayName(entry), reason: String(entry?.reason || "") }))
    .filter((entry) => entry.item && entry.item !== "无")
    .slice(0, 8);
}

export function normalizeTargetPlanData(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const match = { ...targetDefaults.inventoryMatch, ...p.inventoryMatch };
  const shopping = { ...targetDefaults.shoppingPlan, ...p.shoppingPlan };
  return {
    ...targetDefaults,
    ...p,
    targetDish: { ...targetDefaults.targetDish, ...p.targetDish },
    verdict: { ...targetDefaults.verdict, ...p.verdict },
    inventoryMatch: {
      ...match,
      availableItems: nameList(match.availableItems),
      missingCritical: nameList(match.missingCritical),
      missingOptional: nameList(match.missingOptional),
      needsConfirmationItems: nameList(match.needsConfirmationItems),
    },
    shoppingPlan: {
      mustBuy: buyList(shopping.mustBuy),
      confirmAtHome: nameList(shopping.confirmAtHome),
      optionalUpgrades: nameList(shopping.optionalUpgrades),
    },
    executionPlan: { ...targetDefaults.executionPlan, ...p.executionPlan },
    userFit: { ...targetDefaults.userFit, ...p.userFit },
  };
}

// ---------- 上次确认库存（本设备 localStorage） ----------

const SNAPSHOT_KEY = "fridgeDinner:lastConfirmedInventory:v2";

export function saveInventorySnapshot(inventory, metadata = {}) {
  const items = (inventory || [])
    .map((item) => ({
      name: itemDisplayName(item),
      category: String(item?.category || "").trim(),
      quantityEstimate: String(item?.quantityEstimate || "").trim(),
      state: String(item?.state || "用户确认可用").trim(),
      notes: String(item?.notes || "").trim(),
    }))
    .filter((item) => item.name)
    .slice(0, 20);
  if (!items.length) return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      confirmedAt: new Date().toISOString(),
      source: String(metadata.source || "confirmed"),
      items,
    }));
  } catch {
    // 隐私模式等场景下存储不可用，本次流程不受影响
  }
}

export function loadInventorySnapshot() {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.items?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function snapshotAgeLabel(isoTime) {
  const then = new Date(isoTime).getTime();
  if (!Number.isFinite(then)) return "之前";
  const hours = Math.max(0, Math.round((Date.now() - then) / 3600000));
  if (hours < 1) return "1 小时内";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

// ---------- 会话恢复（不含原始照片） ----------

const SESSION_STATE_KEY = "fridgeDinner:tonightSession:v1";

export function saveSessionState(state) {
  try {
    window.sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默跳过
  }
}

export function loadSessionState() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSessionState() {
  try {
    window.sessionStorage.removeItem(SESSION_STATE_KEY);
  } catch {
    // 忽略
  }
}

// ---------- 菜名工具 ----------

// 文件名兜底：只有文件名本身可读时才预填
export function readableDishNameFromFile(fileName) {
  const base = String(fileName || "").replace(/\.[a-z0-9]+$/i, "").trim();
  if (!base) return "";
  if (/^(img|image|pxl_|screenshot|截图|微信图片|mmexport|wx_|wx_camera|photo|videoframe|dsc[_-]?|dcim)/i.test(base)) return "";
  if (/^[\d_\-\s]+$/.test(base)) return "";
  if (!/[一-龥a-zA-Z]/.test(base)) return "";
  return base.slice(0, 20);
}

export function parseMinutes(text) {
  const matches = String(text || "").match(/\d+/g);
  if (!matches?.length) return null;
  return Math.max(...matches.map(Number));
}
