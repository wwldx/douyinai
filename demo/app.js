let userContext = window.FridgeProfile.buildUserContext();

const samples = [
  {
    id: "quick",
    name: "新手赶时间",
    scene: "番茄 / 鸡蛋 / 面条",
    color: "#2f6f5e",
    fridge: {
      shelfTop: ["牛奶", "酸奶", "鸡蛋"],
      shelfMid: ["番茄", "黄瓜", "面条"],
      shelfLow: ["速冻饺子", "矿泉水", "辣酱"],
    },
    vision: {
      items: [
        { name: "番茄", category: "蔬菜", quantityEstimate: "2 个", confidence: 0.91, state: "看起来可用", notes: "中层左侧" },
        { name: "鸡蛋", category: "蛋奶", quantityEstimate: "约 4 个", confidence: 0.86, state: "未见明显异常", notes: "上层蛋盒" },
        { name: "面条", category: "主食", quantityEstimate: "1 袋", confidence: 0.79, state: "包装完整", notes: "中层右侧" },
        { name: "黄瓜", category: "蔬菜", quantityEstimate: "1 根", confidence: 0.78, state: "需要确认新鲜度", notes: "中层靠前" },
        { name: "速冻饺子", category: "速食", quantityEstimate: "半袋", confidence: 0.83, state: "需确认冷冻状态", notes: "下层抽屉" },
        { name: "牛奶", category: "蛋奶", quantityEstimate: "1 盒", confidence: 0.88, state: "需确认保质期", notes: "上层左侧" },
      ],
      uncertainItems: [{ description: "右下角透明袋内食材", reason: "遮挡严重，无法确认是青菜还是剩菜" }],
      warnings: ["图片无法判断是否过期或完全新鲜，需要用户自行确认。"],
    },
    plan: {
      decision: "cook_with_existing_items",
      score: 92,
      summary: "今晚建议自己做番茄鸡蛋面。已有核心材料，25 分钟内能完成，适合新手，也不会占用太多锅具。",
      baseMeal: {
        name: "番茄鸡蛋面",
        why: "番茄、鸡蛋和面条都可用，热乎、低失败率，能避开复杂刀工和油炸。",
        timeCost: "20-25 分钟",
        difficulty: "新手友好",
        requiredItems: ["番茄", "鸡蛋", "面条"],
        steps: ["番茄切块，鸡蛋打散。", "少油炒鸡蛋后盛出。", "番茄炒软后加水煮开。", "下面条，最后放回鸡蛋并简单调味。"],
        safetyTips: ["切番茄时用稳定砧板，手不要贴近刀口。", "油温不要太高，新手不建议大火爆炒。", "牛奶和速冻食品需要先确认保质期与冷冻状态。"],
      },
      stretchMeal: {
        name: "黄瓜鸡蛋拌面",
        why: "如果想要更清爽，可以把黄瓜切丝加到面里，但会多一个切配步骤。",
        extraSkill: "练习基础刀工",
        timeCost: "25-30 分钟",
      },
      shoppingUpgrade: {
        neededItems: ["青菜", "葱"],
        reason: "补一把青菜后口感和营养更完整，葱只作为加分项，不买也能做。",
        estimatedCost: "6-10 元",
      },
      fallback: {
        type: "quick_meal_or_delivery",
        condition: "如果实际只剩 15 分钟",
        suggestion: "直接煮速冻饺子或点一份清淡热食，不建议今晚做复杂炒菜。",
      },
      commerceSuggestion: {
        type: "fresh_restock",
        title: "轻补货，不硬推",
        item: "青菜 + 葱",
        reason: "只推荐 1 到 2 个能显著改善今晚这顿饭的材料，避免为了做菜反而增加负担。",
      },
    },
  },
  {
    id: "practice",
    name: "想练一道菜",
    scene: "豆腐 / 鸡胸 / 胡萝卜",
    color: "#286f7a",
    fridge: {
      shelfTop: ["鸡胸肉", "豆腐", "酸奶"],
      shelfMid: ["胡萝卜", "生菜", "米饭"],
      shelfLow: ["沙拉酱", "鸡蛋", "矿泉水"],
    },
    vision: {
      items: [
        { name: "豆腐", category: "蛋白质", quantityEstimate: "1 盒", confidence: 0.87, state: "包装完整", notes: "上层中间" },
        { name: "鸡胸肉", category: "蛋白质", quantityEstimate: "1 包", confidence: 0.72, state: "需确认是否解冻", notes: "上层左侧包装" },
        { name: "胡萝卜", category: "蔬菜", quantityEstimate: "2 根", confidence: 0.9, state: "看起来可用", notes: "中层左侧" },
        { name: "生菜", category: "蔬菜", quantityEstimate: "半颗", confidence: 0.77, state: "需要确认叶片状态", notes: "中层右侧" },
        { name: "米饭", category: "主食", quantityEstimate: "1 盒", confidence: 0.69, state: "需确认存放时间", notes: "中层后方" },
      ],
      uncertainItems: [{ description: "白色保鲜盒", reason: "无法判断内容与存放时间，不纳入推荐核心材料" }],
      warnings: ["剩饭和肉类需要用户确认存放时间，AI 不直接判断安全食用。"],
    },
    plan: {
      decision: "cook_with_small_practice",
      score: 84,
      summary: "今晚可以做豆腐胡萝卜盖饭，保留一点练习空间，但不推荐处理复杂肉类。",
      baseMeal: {
        name: "豆腐胡萝卜盖饭",
        why: "用豆腐和胡萝卜就能成菜，比处理鸡胸肉更稳，也符合少油和低精力状态。",
        timeCost: "25 分钟",
        difficulty: "新手可控",
        requiredItems: ["豆腐", "胡萝卜", "米饭"],
        steps: ["胡萝卜切薄片，豆腐切小块。", "少油炒胡萝卜至变软。", "加入豆腐和少量水，轻轻翻动。", "调味后盖在热米饭上。"],
        safetyTips: ["豆腐易碎，翻动时用锅铲轻推。", "如果米饭存放超过一天或有异味，不要使用。", "鸡胸肉未完全解冻时不要强行快炒。"],
      },
      stretchMeal: {
        name: "鸡胸生菜饭碗",
        why: "如果确认鸡胸肉新鲜且已解冻，可以煎熟切片搭配生菜。",
        extraSkill: "判断肉类熟度",
        timeCost: "35 分钟",
      },
      shoppingUpgrade: {
        neededItems: ["蒜", "蚝油"],
        reason: "少量调味能提升豆腐盖饭完成度，但不是必需项。",
        estimatedCost: "8-12 元",
      },
      fallback: {
        type: "simple_cook",
        condition: "如果不想开火太久",
        suggestion: "只热米饭和豆腐，生菜做冷配菜；肉类留到明天处理。",
      },
      commerceSuggestion: {
        type: "cookware",
        title: "工具建议保持克制",
        item: "小号不粘锅",
        reason: "如果经常一个人做简单盖饭，不粘锅能降低失败率；只为今晚这顿则不建议购买。",
      },
    },
  },
  {
    id: "late",
    name: "太晚太累",
    scene: "饺子 / 饮料 / 少量蔬菜",
    color: "#d95f43",
    fridge: {
      shelfTop: ["可乐", "酸奶", "矿泉水"],
      shelfMid: ["生菜", "鸡蛋", "辣酱"],
      shelfLow: ["速冻饺子", "面包", "剩菜盒"],
    },
    vision: {
      items: [
        { name: "速冻饺子", category: "速食", quantityEstimate: "1 袋", confidence: 0.9, state: "需确认冷冻状态", notes: "下层抽屉" },
        { name: "鸡蛋", category: "蛋奶", quantityEstimate: "2 个", confidence: 0.76, state: "未见明显异常", notes: "中层中间" },
        { name: "生菜", category: "蔬菜", quantityEstimate: "少量", confidence: 0.71, state: "需要确认叶片状态", notes: "中层左侧" },
        { name: "面包", category: "主食", quantityEstimate: "半袋", confidence: 0.82, state: "需确认保质期", notes: "下层右侧" },
        { name: "可乐", category: "饮料", quantityEstimate: "2 瓶", confidence: 0.94, state: "可见包装", notes: "上层左侧" },
      ],
      uncertainItems: [{ description: "剩菜盒", reason: "看不到内容和存放时间，今晚不作为推荐依据" }],
      warnings: ["透明盒和剩菜无法仅凭图片判断是否安全。"],
    },
    plan: {
      decision: "quick_meal_first",
      score: 78,
      summary: "今晚不建议认真做菜。更现实的选择是煮速冻饺子，少量生菜做配菜，15 分钟内结束。",
      baseMeal: {
        name: "速冻饺子 + 生菜汤",
        why: "现在时间晚、精力低，速冻饺子比临时炒菜更稳；生菜只做简单搭配。",
        timeCost: "12-15 分钟",
        difficulty: "几乎零失败",
        requiredItems: ["速冻饺子", "生菜"],
        steps: ["烧水后下速冻饺子。", "饺子浮起后继续煮到完全熟。", "最后烫入生菜。", "用少量酱油或辣酱调味。"],
        safetyTips: ["速冻食品必须煮到中心完全热透。", "剩菜盒不明内容不建议今晚食用。", "太晚不要再做油烟大的菜。"],
      },
      stretchMeal: {
        name: "鸡蛋煎面包",
        why: "如果还想吃点主食，可以用鸡蛋和面包做简单加餐。",
        extraSkill: "控制小火",
        timeCost: "10 分钟",
      },
      shoppingUpgrade: {
        neededItems: ["无"],
        reason: "今晚不建议再出门补买，完成一顿热食优先。",
        estimatedCost: "0 元",
      },
      fallback: {
        type: "delivery",
        condition: "如果饺子冷冻状态异常或已经太饿",
        suggestion: "点一份清淡热汤面或粥，不要点重油重辣夜宵。",
      },
      commerceSuggestion: {
        type: "delivery",
        title: "外卖兜底只在必要时出现",
        item: "清淡热汤面 / 粥",
        reason: "商业推荐服务于当前时间和安全约束，而不是强行引导消费。",
      },
    },
  },
];

const fallbackUpload = {
  ...samples[0],
  id: "upload",
  name: "现场上传",
  scene: "上传图片待识别",
  plan: {
    ...samples[0].plan,
    score: 86,
    summary: "已接收现场上传图片。请先调用视觉识别 Agent，再确认库存并生成晚餐方案。",
  },
};

const fallbackTargetPlan = {
  targetDish: {
    name: "番茄牛腩",
    intentTime: "tonight",
    coreTaste: "热乎、酸甜、下饭",
    estimatedTime: "90 分钟以上",
    difficulty: "中等偏难",
  },
  verdict: {
    title: "今晚不建议硬做，给你一条可执行替代路线",
    summary: "当前样例里有番茄和鸡蛋，但缺少牛腩、土豆等关键材料。今晚可以先保留酸甜热食体验，改做番茄鸡蛋面；如果明天还想复刻，再补齐牛腩和土豆。",
    primaryAction: "cook_simplified",
  },
  inventoryMatch: {
    availableItems: ["番茄", "鸡蛋", "面条"],
    missingCritical: ["牛腩", "土豆"],
    missingOptional: ["洋葱", "八角"],
    substitutions: [{ from: "牛腩", to: "鸡蛋", result: "今晚改成番茄鸡蛋面，保留热乎酸甜口" }],
  },
  executionPlan: {
    recommendedVersion: "今晚做番茄鸡蛋面，明天补齐材料再复刻番茄牛腩。",
    steps: ["确认番茄、鸡蛋和面条可用。", "先做番茄汤底，再加入面条。", "最后加入鸡蛋，做成低失败率热汤面。"],
    difficultyWarnings: ["番茄牛腩需要较长炖煮时间，对新手和 25 分钟时间预算都偏吃力。", "肉类新鲜度和熟度不能只靠图片判断，需要人工确认。"],
    prepForTomorrow: "如果明天想吃番茄牛腩，今晚先补买牛腩和土豆，明天预留 90 分钟以上。",
  },
  userFit: {
    skillNote: "对新手来说，从零做番茄牛腩偏难。",
    timeNote: "当前时间预算更适合 25 分钟内的一锅热食。",
    profileNotes: ["参考了新手厨艺和低洗锅倾向。", "尊重用户想吃酸甜热食的意愿，优先给可执行替代路线。"],
  },
  commerceCards: [
    {
      type: "douyin_mall",
      title: "明天复刻补齐关键材料",
      item: "牛腩 + 土豆组合",
      reason: "这是番茄牛腩的核心缺口；今晚不买也能先做简化热食。",
      cta: "模拟去抖音商城看看",
    },
    {
      type: "douyin_mall",
      title: "省事版本",
      item: "番茄牛腩半成品包",
      reason: "如果想降低处理肉类和长时间炖煮的失败率，可以作为明天方案。",
      cta: "模拟查看半成品",
    },
  ],
  talkTrack: "刷到想吃的菜后，不是直接给菜谱，而是先看冰箱和用户状态，判断今晚能不能复刻，并给出补买或替代路线。",
};

let activeSample = samples[0];
let confirmedItems = new Set(activeSample.vision.items.map((item) => item.name));
let uploadedImageDataUrl = "";
let uploadedSourceFileName = "";
let activeProvider = "mock";
let inventorySource = "缓存样例";
let lastVisionError = "";
let targetDishPlan = fallbackTargetPlan;
let targetDishImageDataUrl = "";
let targetDishSourceFileName = "";
let targetDishImageAnalysis = null;
let targetVoiceController = null;
let isBusy = false;
let operationTimer = 0;

const MAX_IMAGE_EDGE = 1600;
const COMPRESS_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_JPEG_QUALITY = 0.82;

const elements = {
  modeStatus: document.querySelector("#modeStatus"),
  sampleGrid: document.querySelector("#sampleGrid"),
  fridgeUpload: document.querySelector("#fridgeUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  analyzeButton: document.querySelector("#analyzeButton"),
  planButton: document.querySelector("#planButton"),
  cacheVisionButton: document.querySelector("#cacheVisionButton"),
  targetDishUpload: document.querySelector("#targetDishUpload"),
  targetDishPreview: document.querySelector("#targetDishPreview"),
  targetDishGuess: document.querySelector("#targetDishGuess"),
  targetDishText: document.querySelector("#targetDishText"),
  targetVoiceButton: document.querySelector("#targetVoiceButton"),
  targetVoiceStatus: document.querySelector("#targetVoiceStatus"),
  targetDishTime: document.querySelector("#targetDishTime"),
  targetDishAnalyzeButton: document.querySelector("#targetDishAnalyzeButton"),
  targetDishButton: document.querySelector("#targetDishButton"),
  resetButton: document.querySelector("#resetButton"),
  contextGrid: document.querySelector("#contextGrid"),
  userSelect: document.querySelector("#userSelect"),
  profileTraits: document.querySelector("#profileTraits"),
  feedbackActions: document.querySelector("#feedbackActions"),
  inventoryCount: document.querySelector("#inventoryCount"),
  inventoryList: document.querySelector("#inventoryList"),
  uncertainBox: document.querySelector("#uncertainBox"),
  decisionTitle: document.querySelector("#decisionTitle"),
  scoreValue: document.querySelector("#scoreValue"),
  decisionSummary: document.querySelector("#decisionSummary"),
  summaryStrip: document.querySelector("#summaryStrip"),
  profileNotes: document.querySelector("#profileNotes"),
  baseTime: document.querySelector("#baseTime"),
  baseMealName: document.querySelector("#baseMealName"),
  baseWhy: document.querySelector("#baseWhy"),
  baseSteps: document.querySelector("#baseSteps"),
  stretchMealName: document.querySelector("#stretchMealName"),
  stretchMealBody: document.querySelector("#stretchMealBody"),
  shoppingList: document.querySelector("#shoppingList"),
  shoppingReason: document.querySelector("#shoppingReason"),
  fallbackText: document.querySelector("#fallbackText"),
  targetVerdictTitle: document.querySelector("#targetVerdictTitle"),
  targetDishName: document.querySelector("#targetDishName"),
  targetVerdictSummary: document.querySelector("#targetVerdictSummary"),
  targetMatchList: document.querySelector("#targetMatchList"),
  targetSteps: document.querySelector("#targetSteps"),
  targetWarnings: document.querySelector("#targetWarnings"),
  targetCommerceCards: document.querySelector("#targetCommerceCards"),
  safetyText: document.querySelector("#safetyText"),
  pitchText: document.querySelector("#pitchText"),
  commerceTitle: document.querySelector("#commerceTitle"),
  commerceBody: document.querySelector("#commerceBody"),
  toast: document.querySelector("#toast"),
};

function setBusy(busy, message) {
  window.clearInterval(operationTimer);
  operationTimer = 0;
  isBusy = busy;
  window.requestAnimationFrame(() => {
    elements.modeStatus.classList.toggle("busy", busy);
  });
  elements.analyzeButton.disabled = busy || !uploadedImageDataUrl;
  elements.planButton.disabled = busy;
  elements.targetDishAnalyzeButton.disabled = busy || !targetDishImageDataUrl;
  elements.targetDishButton.disabled = busy || !elements.targetDishText.value.trim();
  targetVoiceController?.setDisabled(busy);
  updateCacheButton(busy);
  if (message) elements.modeStatus.textContent = message;
}

function operationHint(kind, seconds) {
  if (kind === "vision") {
    if (seconds < 3) return "发送图片";
    if (seconds < 18) return "等待视觉模型";
    if (seconds < 45) return "模型仍在识别";
    return "耗时较长，可稍等或使用上次识别";
  }

  if (kind === "target") {
    if (seconds < 3) return "发送目标菜和库存";
    if (seconds < 16) return "判断复刻路线";
    if (seconds < 35) return "生成缺料和补齐建议";
    return "耗时较长，请稍等";
  }

  if (kind === "dishVision") {
    if (seconds < 3) return "发送目标菜图片";
    if (seconds < 18) return "识别菜名和关键材料";
    if (seconds < 45) return "模型仍在看菜图";
    return "耗时较长，请稍等";
  }

  if (seconds < 3) return "发送确认库存";
  if (seconds < 16) return "等待晚餐规划";
  if (seconds < 35) return "模型仍在规划";
  return "耗时较长，请稍等";
}

function startOperationStatus(kind, label) {
  const startedAt = Date.now();
  window.clearInterval(operationTimer);
  const tick = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    elements.modeStatus.textContent = `${label} · ${seconds}s · ${operationHint(kind, seconds)}`;
  };
  tick();
  operationTimer = window.setInterval(tick, 1000);
  elements.modeStatus.classList.add("busy");
  return startedAt;
}

function finishOperationStatus(message) {
  window.clearInterval(operationTimer);
  operationTimer = 0;
  elements.modeStatus.classList.remove("busy");
  elements.modeStatus.textContent = message;
}

function readCachedVision() {
  return window.FridgeProfile.readVisionCache();
}

function saveCachedVision(data) {
  if (!data?.vision?.items?.length) return;
  const payload = {
    provider: data.provider || "model",
    model: data.model || "model",
    vision: normalizeVision(data.vision),
    cachedAt: new Date().toISOString(),
  };
  window.FridgeProfile.saveVisionCache(payload);
  updateCacheButton(isBusy);
}

function formatCacheTime(value) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateCacheButton(forceBusy = isBusy) {
  if (!elements.cacheVisionButton) return;
  const cached = readCachedVision();
  elements.cacheVisionButton.disabled = forceBusy || !cached;
  elements.cacheVisionButton.textContent = cached ? "加载上次识别" : "暂无识别缓存";
}

function applyVisionResult(data, sourceLabel) {
  activeProvider = data.provider || "openai";
  inventorySource = sourceLabel;
  lastVisionError = "";
  activeSample = makeUploadSample(data.vision, fallbackUpload.plan);
  resetConfirmedItems(activeSample);
  renderInventory();
  renderAnalysis();
}

function resetConfirmedItems(sample) {
  confirmedItems = new Set(sample.vision.items.map((item) => item.name));
}

function getConfirmedInventory() {
  return activeSample.vision.items.filter((item) => confirmedItems.has(item.name));
}

function normalizeVision(vision) {
  return {
    items: Array.isArray(vision?.items) ? vision.items : [],
    uncertainItems: Array.isArray(vision?.uncertainItems) ? vision.uncertainItems : [],
    warnings: Array.isArray(vision?.warnings) ? vision.warnings : ["模型未返回安全边界，需人工确认食材状态。"],
  };
}

function normalizePlan(plan) {
  return {
    ...samples[0].plan,
    ...plan,
    personalizationNotes: Array.isArray(plan?.personalizationNotes)
      ? plan.personalizationNotes
      : ["参考了当前时间、精力和厨艺水平。", "结合了显式偏好和人工确认后的库存。"],
    baseMeal: { ...samples[0].plan.baseMeal, ...plan?.baseMeal },
    stretchMeal: { ...samples[0].plan.stretchMeal, ...plan?.stretchMeal },
    shoppingUpgrade: { ...samples[0].plan.shoppingUpgrade, ...plan?.shoppingUpgrade },
    fallback: { ...samples[0].plan.fallback, ...plan?.fallback },
    commerceSuggestion: { ...samples[0].plan.commerceSuggestion, ...plan?.commerceSuggestion },
  };
}

function normalizeTargetDishPlan(plan) {
  return {
    ...fallbackTargetPlan,
    ...plan,
    targetDish: { ...fallbackTargetPlan.targetDish, ...plan?.targetDish },
    verdict: { ...fallbackTargetPlan.verdict, ...plan?.verdict },
    inventoryMatch: {
      ...fallbackTargetPlan.inventoryMatch,
      ...plan?.inventoryMatch,
      availableItems: Array.isArray(plan?.inventoryMatch?.availableItems) ? plan.inventoryMatch.availableItems : fallbackTargetPlan.inventoryMatch.availableItems,
      missingCritical: Array.isArray(plan?.inventoryMatch?.missingCritical) ? plan.inventoryMatch.missingCritical : fallbackTargetPlan.inventoryMatch.missingCritical,
      missingOptional: Array.isArray(plan?.inventoryMatch?.missingOptional) ? plan.inventoryMatch.missingOptional : fallbackTargetPlan.inventoryMatch.missingOptional,
      substitutions: Array.isArray(plan?.inventoryMatch?.substitutions) ? plan.inventoryMatch.substitutions : fallbackTargetPlan.inventoryMatch.substitutions,
    },
    executionPlan: {
      ...fallbackTargetPlan.executionPlan,
      ...plan?.executionPlan,
      steps: Array.isArray(plan?.executionPlan?.steps) ? plan.executionPlan.steps : fallbackTargetPlan.executionPlan.steps,
      difficultyWarnings: Array.isArray(plan?.executionPlan?.difficultyWarnings)
        ? plan.executionPlan.difficultyWarnings
        : fallbackTargetPlan.executionPlan.difficultyWarnings,
    },
    userFit: {
      ...fallbackTargetPlan.userFit,
      ...plan?.userFit,
      profileNotes: Array.isArray(plan?.userFit?.profileNotes) ? plan.userFit.profileNotes : fallbackTargetPlan.userFit.profileNotes,
    },
    commerceCards: Array.isArray(plan?.commerceCards) ? plan.commerceCards : fallbackTargetPlan.commerceCards,
  };
}

function normalizeTargetDishVision(vision) {
  return {
    dishName: vision?.dishName || "目标菜待确认",
    confidence: typeof vision?.confidence === "number" ? vision.confidence : 0,
    dishType: vision?.dishType || "菜品",
    coreTaste: vision?.coreTaste || "口味待确认",
    likelyIngredients: Array.isArray(vision?.likelyIngredients) ? vision.likelyIngredients : [],
    optionalIngredients: Array.isArray(vision?.optionalIngredients) ? vision.optionalIngredients : [],
    requiredTools: Array.isArray(vision?.requiredTools) ? vision.requiredTools : [],
    estimatedTime: vision?.estimatedTime || "耗时待确认",
    difficulty: vision?.difficulty || "难度待确认",
    visualEvidence: Array.isArray(vision?.visualEvidence) ? vision.visualEvidence : [],
    warnings: Array.isArray(vision?.warnings) ? vision.warnings : [],
  };
}

function cleanDishName(name) {
  const cleaned = String(name || "")
    .replace(/^(疑似|可能是|可能为|大概率是)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleaned) return "";
  if (/^(模型结果|目标菜|目标菜待确认|待确认|未知|未知菜品|无法确定|不确定|菜品|食物|图片|照片)$/i.test(cleaned)) return "";
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 18);
}

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/[，。！？,.!?]+$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isSupplementSpeech(text) {
  return /(只有|不要|不想|少油|少盐|清淡|微辣|别太辣|不辣|分钟|小时|洗锅|锅具|空气炸锅|明天|这周|今晚|今天|太麻烦|简单点)/.test(text);
}

function applySpeechToTargetDish(rawText) {
  const text = normalizeSpeechText(rawText);
  if (!text) return;

  const current = elements.targetDishText.value.trim();
  const timeText = elements.targetDishTime.options[elements.targetDishTime.selectedIndex]?.textContent || "今晚";
  const alreadyHasIntent = /(想吃|想做|复刻|做一道|来一份)/.test(text);
  const shouldAppend = current && isSupplementSpeech(text) && !alreadyHasIntent;
  const nextText = shouldAppend ? `${current.replace(/[；;，,。]+$/g, "")}；${text}` : alreadyHasIntent ? text : `我${timeText}想吃${text}`;

  elements.targetDishText.value = nextText;
  elements.targetDishButton.disabled = isBusy || !nextText.trim();
  showToast("语音已写入目标菜");
}

function decisionRouteLabel(decision) {
  const labels = {
    cook_with_existing_items: "自炊",
    cook_with_small_purchase: "补买",
    quick_meal_first: "速食",
    delivery_recommended: "外卖",
    cook_with_small_practice: "练习",
  };
  return labels[decision] || "方案";
}

function refreshUserContext() {
  userContext = window.FridgeProfile.buildUserContext();
}

function makeUploadSample(vision = fallbackUpload.vision, plan = fallbackUpload.plan) {
  const itemNames = normalizeVision(vision)
    .items.slice(0, 6)
    .map((item) => item.name);

  return {
    ...fallbackUpload,
    vision: normalizeVision(vision),
    plan: normalizePlan(plan),
    fridge: {
      shelfTop: itemNames.slice(0, 3),
      shelfMid: itemNames.slice(3, 6),
      shelfLow: ["待确认", "安全边界"],
    },
  };
}

function getAdjustedPlan() {
  const plan = normalizePlan(activeSample.plan);
  const inventoryNames = new Set(getConfirmedInventory().map((item) => item.name));
  const missingRequired = plan.baseMeal.requiredItems.filter((item) => !inventoryNames.has(item));

  if (!missingRequired.length) return plan;

  return {
    ...plan,
    score: Math.max(62, plan.score - missingRequired.length * 12),
    summary: `${plan.summary} 但你刚刚取消了「${missingRequired.join("、")}」，AI 会把它降级为补买项或建议走兜底方案。`,
    shoppingUpgrade: {
      ...plan.shoppingUpgrade,
      neededItems: [...new Set([...missingRequired, ...plan.shoppingUpgrade.neededItems.filter((item) => item !== "无")])],
      reason: `关键材料缺少 ${missingRequired.join("、")}。建议先补齐核心材料，否则直接采用兜底方案。`,
    },
    fallback: {
      ...plan.fallback,
      suggestion: `如果不想补买 ${missingRequired.join("、")}，${plan.fallback.suggestion}`,
    },
  };
}

function renderSamples() {
  elements.sampleGrid.innerHTML = samples
    .map(
      (sample) => `
        <button class="sample-card ${sample.id === activeSample.id ? "active" : ""}" type="button" data-sample-id="${sample.id}">
          <div class="mini-fridge" style="--sample-color: ${sample.color}">
            ${Object.values(sample.fridge)
              .map(
                (shelf) => `
                  <div class="fridge-shelf">
                    ${shelf.map((item) => `<span>${item}</span>`).join("")}
                  </div>
                `,
              )
              .join("")}
          </div>
          <span class="sample-name">${sample.name}</span>
          <small>${sample.scene}</small>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-sample-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = samples.find((sample) => sample.id === button.dataset.sampleId);
      if (!next) return;
      activeSample = next;
      activeProvider = "mock";
      uploadedImageDataUrl = "";
      resetConfirmedItems(activeSample);
      elements.modeStatus.textContent = "缓存视觉样例";
      elements.analyzeButton.disabled = true;
      elements.planButton.disabled = false;
      elements.fridgeUpload.value = "";
      elements.uploadPreview.style.display = "none";
      elements.uploadPreview.removeAttribute("src");
      render();
    });
  });
}

function renderContext() {
  refreshUserContext();
  const fields = [
    ["厨艺", userContext.user.cookingLevel],
    ["可用时间", userContext.context.availableCookingTime],
    ["精力", userContext.context.energyLevel],
    ["偏好", userContext.user.preferences.join(" / ")],
    ["避开", userContext.user.avoid.join(" / ")],
    ["近期", userContext.user.recentMeals.join("、")],
  ];

  elements.contextGrid.innerHTML = fields
    .map(
      ([label, value]) => `
        <div>
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderProfile() {
  refreshUserContext();
  const users = window.FridgeProfile.getUsers();
  elements.userSelect.innerHTML = users
    .map((user) => `<option value="${user.id}" ${user.id === window.FridgeProfile.getSelectedUserId() ? "selected" : ""}>${user.name} · ${user.label}</option>`)
    .join("");

  const traits = userContext.profile?.traits || [];
  elements.profileTraits.innerHTML = traits.length
    ? traits.map((trait) => `<span title="${trait.evidence.join(" / ")}">${trait.label} · ${(trait.confidence * 100).toFixed(0)}%</span>`).join("")
    : "<span>暂无推断标签</span>";

  elements.feedbackActions.innerHTML = window.FridgeProfile.FEEDBACK_OPTIONS.map(
    (option) => `<button type="button" data-feedback-label="${option.label}">${option.label}</button>`,
  ).join("");

  document.querySelectorAll("[data-feedback-label]").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.FridgeProfile.recordFeedback(button.dataset.feedbackLabel, {
        source: "demo",
        mealName: activeSample.plan.baseMeal.name,
      });
      refreshUserContext();
      renderContext();
      renderProfile();
      showToast(`已记录反馈：${button.dataset.feedbackLabel}`);
    });
  });
}

function renderInventory() {
  const confirmedCount = getConfirmedInventory().length;
  elements.inventoryCount.textContent = `${inventorySource} · ${confirmedCount}/${activeSample.vision.items.length} 已确认`;

  if (!activeSample.vision.items.length) {
    elements.inventoryList.innerHTML = `
      <div class="inventory-empty">${
        lastVisionError
          ? `识别失败：${lastVisionError}。当前未使用缓存结果，请检查服务、模型配置或切换到开发页查看原始返回。`
          : "等待视觉识别结果。也可以直接选择下方缓存样例演示完整流程。"
      }</div>
    `;
    elements.uncertainBox.innerHTML = `
      <strong>不确定项与安全边界</strong>
      <ul><li>${lastVisionError ? "识别失败时不展示缓存食材，避免误判链路结果。" : "上传图片后，视觉识别 Agent 会在这里列出遮挡、保鲜盒和新鲜度风险。"}</li></ul>
    `;
    return;
  }

  elements.inventoryList.innerHTML = activeSample.vision.items
    .map((item) => {
      const checked = confirmedItems.has(item.name);
      return `
        <label class="inventory-item ${checked ? "checked" : ""}">
          <input type="checkbox" data-item-name="${item.name}" ${checked ? "checked" : ""} />
          <span class="item-main">
            <strong>${item.name}</strong>
            <small>${item.category} · ${item.quantityEstimate} · 置信 ${(item.confidence * 100).toFixed(0)}%</small>
          </span>
          <span class="item-state">${item.state}</span>
        </label>
      `;
    })
    .join("");

  const uncertain = activeSample.vision.uncertainItems
    .map((item) => `<li>${item.description}：${item.reason}</li>`)
    .join("");
  const warnings = activeSample.vision.warnings.map((warning) => `<li>${warning}</li>`).join("");
  elements.uncertainBox.innerHTML = `
    <strong>不确定项与安全边界</strong>
    <ul>${uncertain}${warnings}</ul>
  `;

  document.querySelectorAll("[data-item-name]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        confirmedItems.add(input.dataset.itemName);
      } else {
        confirmedItems.delete(input.dataset.itemName);
      }
      renderInventory();
      renderAnalysis();
    });
  });
}

function renderSummary(plan) {
  const inventory = getConfirmedInventory();
  const summaryFields = [
    ["决策", plan.decision === "quick_meal_first" ? "速食优先" : "建议自炊"],
    ["材料", inventory.map((item) => item.name).slice(0, 4).join("、") || "待确认"],
    ["时间", plan.baseMeal.timeCost],
    ["难度", plan.baseMeal.difficulty],
  ];

  elements.summaryStrip.innerHTML = summaryFields
    .map(
      ([label, value]) => `
        <div class="summary-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTargetDishGuess() {
  if (!targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "可直接输入目标菜，也可以上传菜图后点击「识别目标菜」。";
    return;
  }

  if (targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "已上传目标菜图。点击「识别目标菜」后，AI 会先猜菜名和关键材料，你仍然可以手动修改。";
    return;
  }

  const vision = normalizeTargetDishVision(targetDishImageAnalysis);
  const ingredients = vision.likelyIngredients.slice(0, 5).join("、") || "关键材料待确认";
  const tools = vision.requiredTools.slice(0, 3).join("、") || "常规厨具";
  elements.targetDishGuess.innerHTML = `
    <strong>${vision.dishName}</strong> · 置信 ${(vision.confidence * 100).toFixed(0)}% · ${vision.difficulty}<br />
    关键材料：${ingredients}<br />
    可能工具：${tools}；预计 ${vision.estimatedTime}
  `;
}

function renderTargetDishPlan() {
  const plan = normalizeTargetDishPlan(targetDishPlan);
  const match = plan.inventoryMatch;
  const available = match.availableItems.length ? match.availableItems.join("、") : "暂无可直接匹配材料";
  const missingCritical = match.missingCritical.length ? match.missingCritical.join("、") : "无关键缺口";
  const missingOptional = match.missingOptional.length ? match.missingOptional.join("、") : "无明显可选缺口";
  const substitutions = match.substitutions.length
    ? match.substitutions.map((item) => `${item.from} -> ${item.to}：${item.result}`).join("；")
    : "暂无替代路线";

  elements.targetVerdictTitle.textContent = plan.verdict.title;
  elements.targetDishName.textContent = plan.targetDish.name;
  elements.targetVerdictSummary.textContent = plan.verdict.summary;
  elements.targetMatchList.innerHTML = [
    ["冰箱已有", available],
    ["关键缺口", missingCritical],
    ["可选缺口", missingOptional],
    ["替代路线", substitutions],
  ]
    .map(([label, value]) => `<span><strong>${label}</strong>${value}</span>`)
    .join("");
  elements.targetSteps.innerHTML = [
    plan.executionPlan.recommendedVersion,
    ...plan.executionPlan.steps,
    plan.executionPlan.prepForTomorrow,
  ]
    .filter(Boolean)
    .map((step) => `<li>${step}</li>`)
    .join("");
  elements.targetWarnings.innerHTML = [
    plan.userFit.skillNote,
    plan.userFit.timeNote,
    ...plan.userFit.profileNotes,
    ...plan.executionPlan.difficultyWarnings,
  ]
    .filter(Boolean)
    .map((warning) => `<li>${warning}</li>`)
    .join("");
  elements.targetCommerceCards.innerHTML = plan.commerceCards.length
    ? plan.commerceCards
        .map(
          (card) => `
            <div class="commerce-mini-card">
              <strong>${card.title}：${card.item}</strong>
              ${card.reason}
              <small>${card.cta}</small>
            </div>
          `,
        )
        .join("")
    : '<div class="commerce-mini-card"><strong>暂不需要补买</strong>先用现有食材完成可执行版本。<small>不硬推消费</small></div>';
}

function renderAnalysis() {
  const plan = getAdjustedPlan();
  const required = plan.baseMeal.requiredItems.join("、");
  const shoppingItems = plan.shoppingUpgrade.neededItems.length ? plan.shoppingUpgrade.neededItems : ["无"];

  elements.decisionTitle.textContent = plan.baseMeal.name;
  elements.scoreValue.textContent = decisionRouteLabel(plan.decision);
  elements.decisionSummary.textContent = plan.summary;
  elements.profileNotes.innerHTML = plan.personalizationNotes.map((note) => `<li>${note}</li>`).join("");
  elements.baseTime.textContent = plan.baseMeal.timeCost;
  elements.baseMealName.textContent = plan.baseMeal.name;
  elements.baseWhy.textContent = `${plan.baseMeal.why} 核心材料：${required}。`;
  elements.baseSteps.innerHTML = plan.baseMeal.steps.map((step) => `<li>${step}</li>`).join("");
  elements.stretchMealName.textContent = plan.stretchMeal.name;
  elements.stretchMealBody.textContent = `${plan.stretchMeal.why} 练习点：${plan.stretchMeal.extraSkill}，预计 ${plan.stretchMeal.timeCost}。`;
  elements.shoppingList.innerHTML = shoppingItems.map((item) => `<span>${item}</span>`).join("");
  elements.shoppingReason.textContent = `${plan.shoppingUpgrade.reason} 预计 ${plan.shoppingUpgrade.estimatedCost}。`;
  elements.fallbackText.textContent = `${plan.fallback.condition}：${plan.fallback.suggestion}`;
  elements.safetyText.innerHTML = plan.baseMeal.safetyTips.map((tip) => `<li>${tip}</li>`).join("");
  elements.pitchText.textContent = `AI 不是只识别冰箱里有什么，而是把视觉库存、用户厨艺、时间和精力一起纳入决策，给出今晚最现实的一顿饭：${plan.baseMeal.name}。当前规划来源：${activeProvider === "mock" ? "缓存兜底" : "模型生成"}。`;
  elements.commerceTitle.textContent = `${plan.commerceSuggestion.title}：${plan.commerceSuggestion.item}`;
  elements.commerceBody.textContent = plan.commerceSuggestion.reason;

  renderSummary(plan);
  renderTargetDishGuess();
  renderTargetDishPlan();
}

function render() {
  renderSamples();
  renderContext();
  renderProfile();
  renderInventory();
  renderAnalysis();
  elements.analyzeButton.disabled = !uploadedImageDataUrl;
  elements.targetDishAnalyzeButton.disabled = isBusy || !targetDishImageDataUrl;
  elements.targetDishButton.disabled = isBusy || !elements.targetDishText.value.trim();
}

function setupSpeechInput() {
  if (!window.FridgeSpeech) {
    elements.targetVoiceButton.disabled = true;
    elements.targetVoiceStatus.textContent = "语音模块未加载，可手动输入。";
    return;
  }

  targetVoiceController = window.FridgeSpeech.createSpeechInput({
    button: elements.targetVoiceButton,
    status: elements.targetVoiceStatus,
    onTranscript: applySpeechToTargetDish,
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1600);
}

function getCopyText(target) {
  if (!target) return "";
  if (target.tagName === "UL") {
    return [...target.querySelectorAll("li")].map((item) => `- ${item.textContent.trim()}`).join("\n");
  }
  return target.textContent.trim();
}

async function copyText(targetId) {
  const target = document.querySelector(`#${targetId}`);
  const text = getCopyText(target);
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast("已复制");
  }
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请上传图片文件"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener("load", async () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const maxEdge = Math.max(width, height);

        if (maxEdge <= MAX_IMAGE_EDGE && file.size <= COMPRESS_IMAGE_BYTES) {
          URL.revokeObjectURL(objectUrl);
          resolve(await readFileDataUrl(file));
          return;
        }

        const scale = Math.min(1, MAX_IMAGE_EDGE / maxEdge);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败"));
    });

    image.src = objectUrl;
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

async function runVisionAgent() {
  if (!uploadedImageDataUrl) {
    showToast("请先上传冰箱照片");
    return;
  }

  try {
    setBusy(true);
    const startedAt = startOperationStatus("vision", "视觉识别中");
    const data = await postJson("/api/analyze-fridge", { imageDataUrl: uploadedImageDataUrl, sourceFileName: uploadedSourceFileName });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    applyVisionResult(data, `模型识别 · ${data.model || "model"}`);
    saveCachedVision(data);
    finishOperationStatus(`视觉识别完成：${data.model || "模型"} · ${seconds}s`);
    showToast(`视觉识别完成，用时 ${seconds}s`);
  } catch (error) {
    lastVisionError = error.message || "识别失败";
    inventorySource = "识别失败";
    activeSample = makeUploadSample({ items: [], uncertainItems: [], warnings: [] }, fallbackUpload.plan);
    resetConfirmedItems(activeSample);
    renderInventory();
    renderAnalysis();
    finishOperationStatus("识别失败，未使用缓存");
    showToast(lastVisionError);
  } finally {
    setBusy(false);
  }
}

async function runDinnerPlanner() {
  const inventory = getConfirmedInventory();
  if (!inventory.length) {
    showToast("请先确认至少一个食材");
    return;
  }
  refreshUserContext();

  try {
    setBusy(true);
    const startedAt = startOperationStatus("plan", "晚餐规划中");
    const data = await postJson("/api/plan-dinner", { inventory, userContext });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    activeProvider = data.provider || "openai";
    activeSample = {
      ...activeSample,
      plan: normalizePlan(data.plan),
    };
    renderAnalysis();
    finishOperationStatus(`晚餐规划完成：${data.model || "模型"} · ${seconds}s`);
    showToast(`晚餐方案已生成，用时 ${seconds}s`);
  } catch (error) {
    activeProvider = "mock";
    renderAnalysis();
    finishOperationStatus("规划失败，保留缓存方案");
    showToast(error.message || "规划失败，保留缓存方案");
  } finally {
    setBusy(false);
  }
}

async function runTargetDishVision() {
  if (!targetDishImageDataUrl) {
    showToast("请先上传想复刻的菜图");
    return;
  }

  try {
    setBusy(true);
    const startedAt = startOperationStatus("dishVision", "目标菜识别中");
    const data = await postJson("/api/analyze-target-dish", { imageDataUrl: targetDishImageDataUrl, sourceFileName: targetDishSourceFileName });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    targetDishImageAnalysis = normalizeTargetDishVision(data.targetVision);
    const dishName = cleanDishName(targetDishImageAnalysis.dishName);
    if (dishName) {
      const timeText = elements.targetDishTime.options[elements.targetDishTime.selectedIndex]?.textContent || "今晚";
      elements.targetDishText.value = `我${timeText}想吃${dishName}`;
    }
    renderTargetDishGuess();
    finishOperationStatus(`目标菜识别完成：${data.model || "模型"} · ${seconds}s`);
    showToast(`目标菜识别完成，用时 ${seconds}s`);
  } catch (error) {
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    finishOperationStatus("目标菜识别失败，可手动输入菜名");
    showToast(error.message || "目标菜识别失败，可手动输入菜名");
  } finally {
    setBusy(false);
  }
}

async function runTargetDishPlanner() {
  const inventory = getConfirmedInventory();
  const targetText = elements.targetDishText.value.trim();
  if (!inventory.length) {
    showToast("请先确认至少一个食材");
    return;
  }
  if (!targetText) {
    showToast("请先输入想吃的菜");
    return;
  }
  refreshUserContext();

  const requestPayload = {
    inventory,
    targetDish: {
      text: targetText,
      intentTime: elements.targetDishTime.value || "tonight",
      imageAnalysis: targetDishImageAnalysis,
    },
    userContext,
  };

  try {
    setBusy(true);
    const startedAt = startOperationStatus("target", "目标菜复刻规划中");
    const data = await postJson("/api/plan-target-dish", requestPayload);
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    activeProvider = data.provider || "openai";
    targetDishPlan = normalizeTargetDishPlan(data.targetPlan);
    renderTargetDishPlan();
    finishOperationStatus(`复刻路线完成：${data.model || "模型"} · ${seconds}s`);
    showToast(`复刻路线已生成，用时 ${seconds}s`);
  } catch (error) {
    targetDishPlan = normalizeTargetDishPlan({
      ...fallbackTargetPlan,
      targetDish: { ...fallbackTargetPlan.targetDish, name: targetText.replace(/^我(今晚|明天|这周)?想吃/, "") || targetText },
    });
    renderTargetDishPlan();
    finishOperationStatus("目标菜规划失败，保留演示样例");
    showToast(error.message || "目标菜规划失败，保留演示样例");
  } finally {
    setBusy(false);
  }
}

function loadCachedVision() {
  const cached = readCachedVision();
  if (!cached) {
    showToast("暂无上次识别结果");
    return;
  }

  applyVisionResult(cached, `上次模型结果 · ${cached.model || "model"}`);
  finishOperationStatus(`已加载上次识别：${formatCacheTime(cached.cachedAt)}`);
  showToast("已加载上次识别结果");
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

elements.analyzeButton.addEventListener("click", runVisionAgent);
elements.planButton.addEventListener("click", runDinnerPlanner);
elements.targetDishAnalyzeButton.addEventListener("click", runTargetDishVision);
elements.targetDishButton.addEventListener("click", runTargetDishPlanner);
elements.cacheVisionButton.addEventListener("click", loadCachedVision);
elements.targetDishText.addEventListener("input", () => {
  elements.targetDishButton.disabled = isBusy || !elements.targetDishText.value.trim();
});
elements.targetDishUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const previewUrl = URL.createObjectURL(file);
  elements.targetDishPreview.src = previewUrl;
  elements.targetDishPreview.style.display = "block";

  try {
    targetDishImageDataUrl = await fileToDataUrl(file);
    targetDishSourceFileName = file.name;
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    elements.targetDishAnalyzeButton.disabled = isBusy || !targetDishImageDataUrl;
    elements.modeStatus.textContent = "已上传目标菜图，待识别";
  } catch (error) {
    targetDishImageDataUrl = "";
    targetDishSourceFileName = "";
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    showToast(error.message || "目标菜图片读取失败");
  }
});
elements.userSelect.addEventListener("change", async () => {
  await window.FridgeProfile.selectUser(elements.userSelect.value);
  refreshUserContext();
  render();
  updateCacheButton(false);
  showToast(`已切换用户：${elements.userSelect.options[elements.userSelect.selectedIndex].textContent}`);
});

elements.fridgeUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const previewUrl = URL.createObjectURL(file);
  elements.uploadPreview.src = previewUrl;
  elements.uploadPreview.style.display = "block";

  try {
    uploadedImageDataUrl = await fileToDataUrl(file);
    uploadedSourceFileName = file.name;
  } catch (error) {
    uploadedImageDataUrl = "";
    uploadedSourceFileName = "";
    showToast(error.message || "图片读取失败");
    return;
  }

  activeProvider = "mock";
  inventorySource = "待识别";
  lastVisionError = "";
  activeSample = makeUploadSample({ items: [], uncertainItems: [], warnings: [] }, fallbackUpload.plan);
  resetConfirmedItems(activeSample);
  elements.modeStatus.textContent = "已上传，待识别";
  render();
});

elements.resetButton.addEventListener("click", () => {
  activeSample = samples[0];
  activeProvider = "mock";
  inventorySource = "缓存样例";
  lastVisionError = "";
  uploadedImageDataUrl = "";
  uploadedSourceFileName = "";
  targetDishImageDataUrl = "";
  targetDishSourceFileName = "";
  targetDishImageAnalysis = null;
  resetConfirmedItems(activeSample);
  elements.fridgeUpload.value = "";
  elements.targetDishUpload.value = "";
  elements.uploadPreview.style.display = "none";
  elements.uploadPreview.removeAttribute("src");
  elements.targetDishPreview.style.display = "none";
  elements.targetDishPreview.removeAttribute("src");
  elements.modeStatus.textContent = "缓存视觉样例";
  targetDishPlan = fallbackTargetPlan;
  render();
});

async function initializeApp() {
  await window.FridgeProfile.init();
  refreshUserContext();
  setupSpeechInput();
  render();
  updateCacheButton(false);
}

initializeApp();
