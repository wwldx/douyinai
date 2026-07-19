import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageFocusSelector from "./components/ImageFocusSelector";
import SpeechInput from "./components/SpeechInput";
import Toast from "./components/Toast";
import { fallbackUploadPlan, normalizePlan, normalizeVision, samples } from "./data/samples";
import { agentSessionHeaders, createAgentRequestId } from "./lib/agentSession";
import { deriveUnknownCoverageStatus, findIngredientMatch, resolveRequiredCoverage } from "./lib/targetCoverage";

const modeCards = [
  {
    id: "busy",
    title: "时间忙",
    subtitle: "25 分钟内，少洗锅",
    time: "25 分钟",
    energy: "中",
    cookingLevel: "新手",
    preferences: ["快手", "少洗锅", "热乎"],
    avoid: ["复杂刀工", "油炸", "长时间炖煮"],
    goal: "想尽快吃上热饭，不想增加额外负担",
  },
  {
    id: "explore",
    title: "想尝试新菜",
    subtitle: "可以多花一点时间",
    time: "40 分钟",
    energy: "中高",
    cookingLevel: "入门",
    preferences: ["愿意练习", "口味完整", "可小幅补买"],
    avoid: ["高失败率", "重油烟"],
    goal: "想在可控难度里尝试一道更有成就感的菜",
  },
  {
    id: "tired",
    title: "今天很累",
    subtitle: "低负担，能吃饱",
    time: "15 分钟",
    energy: "低",
    cookingLevel: "新手",
    preferences: ["省事", "抗饿", "少油烟"],
    avoid: ["多锅并行", "复杂备菜", "重口夜宵"],
    goal: "只想吃一顿稳定热食，不想硬撑复杂做饭",
  },
];

const mealSlots = [
  { id: "breakfast", label: "早餐" },
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
  { id: "late", label: "夜宵" },
];

const resultFeedbackOptions = [
  { label: "正合适", type: "accept_meal", replan: false },
  { label: "太麻烦", type: "too_complex", replan: true },
  { label: "缺料太多", type: "too_many_missing", replan: true },
  { label: "不想洗锅", type: "low_cleanup", replan: true },
  { label: "换清淡点", type: "lighter_taste", replan: true },
];

const CONFIRMED_INVENTORY_SNAPSHOT_KEY = "fridgeDinner:confirmedInventorySnapshot:v1";

function classifyClientInventoryItem(itemOrName) {
  const item = typeof itemOrName === "object" && itemOrName !== null ? itemOrName : { name: itemOrName };
  const name = String(item.name || "").replace(/\s+/g, "").trim();
  const foodMarker = /(酸奶|乳酸菌|牛奶|奶酪|鸡蛋|肉|鱼|虾|蟹|菜|瓜|果|豆|米|面|粉|饺子|饮料|果汁|酱|油|盐|醋|糖|调味|火腿|香肠|豆腐|蘑菇|菌菇|玉米|土豆|红薯)/;
  if (!name) return "unknown";
  if (/(锅具|餐具|厨具|炊具|炒锅|汤锅|平底锅|电饭锅|空气炸锅|保温水瓶|保温瓶|保温杯|水瓶|水杯|杯子|刀具|砧板|筷子|勺子)/.test(name) && !foodMarker.test(name)) return "non_food";
  if (/^(碗|盘|锅|瓶|杯|容器|餐盒)$/.test(name)) return "non_food";
  if (/^(不明|未知|看不清|无法确认)/.test(name)) return "uncertain";
  if (/(疑似|可能|大概|看似|或|类食材|包装食品|包装食物|内容不明|种类不明|具体不明|无法确认)/.test(name)) return "uncertain";
  if (/^(?:白色|黑色|透明|红色|绿色|蓝色)?(?:袋装|盒装|瓶装|罐装|包装)(?:食材|食品|物品|内容物)?$/.test(name) && !foodMarker.test(name)) return "uncertain";
  const evidence = `${item.state || ""} ${item.notes || ""}`.replace(/\s+/g, "");
  if (/(需确认内容|需要确认内容|无法确认内容|看不清内容|无法判断内容|内容不明|种类不明|具体不明)/.test(evidence)) return "uncertain";
  return "food";
}

function sanitizeClientInventory(items) {
  return (Array.isArray(items) ? items : []).filter((item) => classifyClientInventoryItem(item) === "food");
}

function sanitizeClientVision(vision) {
  const sourceItems = Array.isArray(vision?.items) ? vision.items : [];
  const movedToUncertain = sourceItems
    .filter((item) => classifyClientInventoryItem(item) === "uncertain")
    .map((item) => ({
      description: String(item?.name || "不明包装").trim(),
      reason: [
        "当前只能确认大类、包装或容器，无法确定具体食材，暂不参与晚餐规划。",
        item?.notes ? `原识别位置：${String(item.notes).trim()}` : "",
      ].filter(Boolean).join(" "),
    }));
  const uncertainMap = new Map();
  for (const item of [...(Array.isArray(vision?.uncertainItems) ? vision.uncertainItems : []), ...movedToUncertain]) {
    const key = uncertaintyKey(item);
    if (key) uncertainMap.set(key, item);
  }
  return {
    ...vision,
    items: sanitizeClientInventory(sourceItems),
    uncertainItems: [...uncertainMap.values()].slice(0, 8),
  };
}

function uncertaintyKey(item) {
  return `${String(item?.description || "").trim()}::${String(item?.reason || "").trim()}`;
}

function buildReshootInstruction(item) {
  const description = String(item?.description || "没看清的区域").trim();
  const evidence = `${description} ${String(item?.reason || "")}`;
  if (/(抽屉|果蔬盒|果蔬格|下层)/.test(evidence)) return "请拉开并靠近补拍下层抽屉，只让这个区域入镜。";
  if (/(门架|冰箱门|门侧)/.test(evidence)) return "请靠近补拍冰箱门架，让包装正面和标签完整入镜。";
  if (/(上层|顶部)/.test(evidence)) return "请只补拍冰箱上层，避开反光并露出包装正面。";
  if (/(中层|中间)/.test(evidence)) return "请只补拍冰箱中层，让被遮挡的物品完整入镜。";
  if (/(袋|包装|盒|容器|保鲜盒)/.test(evidence)) return `请靠近补拍「${description}」，让标签或开口完整入镜。`;
  return `请靠近补拍「${description}」所在区域，不用重拍整个冰箱。`;
}

function mergeFridgeVisionAfterReshoot(baseVision, incomingVision, target) {
  const base = normalizeVision(sanitizeClientVision(baseVision));
  const incoming = normalizeVision(sanitizeClientVision(incomingVision));
  const itemMap = new Map(base.items.map((item) => [String(item.name || "").trim(), item]));
  const addedNames = [];
  for (const item of incoming.items) {
    const name = String(item?.name || "").trim();
    if (!name) continue;
    if (!itemMap.has(name)) addedNames.push(name);
    itemMap.set(name, item);
  }
  const resolvedTarget = addedNames.length > 0;
  const targetKey = uncertaintyKey(target);
  const uncertaintyMap = new Map();
  for (const item of [...base.uncertainItems, ...incoming.uncertainItems]) {
    const key = uncertaintyKey(item);
    if (!key || (resolvedTarget && key === targetKey)) continue;
    uncertaintyMap.set(key, item);
  }
  return {
    vision: {
      items: [...itemMap.values()].slice(0, 16),
      uncertainItems: [...uncertaintyMap.values()].slice(0, 8),
      warnings: [...new Set([...base.warnings, ...incoming.warnings])].slice(0, 5),
    },
    addedNames,
    resolvedTarget,
  };
}

function readConfirmedInventorySnapshot() {
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(CONFIRMED_INVENTORY_SNAPSHOT_KEY) || "null");
    if (!Array.isArray(snapshot?.items) || !snapshot.items.length || !snapshot.confirmedAt) return null;
    const items = sanitizeClientInventory(snapshot.items);
    return items.length ? { ...snapshot, items } : null;
  } catch {
    return null;
  }
}

function inventorySnapshotTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const dishRescueCategories = [
  {
    id: "state",
    label: "状态不对",
    hint: "看稀稠、形态、分层、焦糊和颜色",
    symptoms: ["太稀", "太干", "粘锅/糊锅", "不成形", "油水分离", "结块", "颜色不对", "快溢锅"],
  },
  {
    id: "taste",
    label: "味道不对",
    hint: "由你试味后告诉 AI",
    symptoms: ["太咸", "太淡", "太辣", "太酸", "太甜"],
  },
  {
    id: "seasoning",
    label: "调料怎么补",
    hint: "结合菜名、人数和当前步骤",
    symptoms: ["忘记放调料", "放多了", "现在该放什么", "替代调料"],
  },
  {
    id: "next_step",
    label: "不知道下一步",
    hint: "先判断阶段，再给一个动作",
    symptoms: ["不知道下一步", "忘了做到哪", "画面和菜谱对不上", "说不清"],
  },
];

const dishRescueDemoSamples = [
  {
    id: "watery-tomato-eggs",
    label: "一键体验：番茄炒蛋太稀",
    path: "/demo-assets/dish-rescue/tomato-eggs-too-watery-demo.png",
    fileName: "tomato-eggs-too-watery-demo.png",
    category: "state",
    symptom: "太稀",
    description: "番茄和鸡蛋已经合在一起，但锅里汤汁一直很稀。",
    dishName: "番茄炒蛋",
    servings: "1 人",
    currentStep: "倒回鸡蛋合炒",
    steps: ["鸡蛋炒至凝固后盛出", "番茄炒出汁", "倒回鸡蛋合炒", "收汁后调味出锅"],
  },
  {
    id: "scorched-chicken-stir-fry",
    label: "一键体验：锅底开始粘糊",
    path: "/demo-assets/dish-rescue/chicken-stir-fry-scorched-demo.png",
    fileName: "chicken-stir-fry-scorched-demo.png",
    category: "state",
    symptom: "粘锅/糊锅",
    description: "锅底已经出现一块焦黑，但上面的鸡肉和青椒看起来还没全糊。",
    dishName: "青椒鸡肉",
    servings: "2 人",
    currentStep: "调味翻炒",
    steps: ["鸡肉滑炒至变色", "加入青红椒和洋葱", "调味翻炒", "确认熟透后出锅"],
  },
];

const ingredientStatusOptions = [
  { value: "no_reminder", label: "暂不提醒" },
  { value: "recently_bought", label: "刚买" },
  { value: "opened", label: "已开封" },
  { value: "label_soon", label: "我确认标签日期临近" },
  { value: "opened_label_soon", label: "已开封且确认日期临近" },
  { value: "unknown", label: "状态不确定" },
];

function storageConfirmationPrompt(item, inventory) {
  const name = String(item?.name || "");
  const category = String(item?.category || "");
  const notes = String(item?.notes || "");
  const hasCrisper = inventory.some((candidate) => /(抽屉|果蔬盒|果蔬格)/.test(String(candidate?.notes || "")));
  if (/(鸡蛋|鸭蛋|鹅蛋|蛋盒|鲜蛋)/.test(name) && /(门架|冰箱门|门侧)/.test(notes)) {
    return { value: "original_carton", placeholder: "包装未确认", label: "仍在原蛋盒" };
  }
  if (/(鸡胸|鸡腿|猪肉|牛肉|羊肉|肉排|鱼|虾|蟹|海鲜)/.test(name) && /(上层|中层)/.test(notes)) {
    return { value: "raw_sealed_leakproof", placeholder: "生鲜与包装未确认", label: "生鲜且已密封防漏" };
  }
  if (hasCrisper && category === "蔬菜" && !/(抽屉|果蔬盒|果蔬格)/.test(notes)) {
    return { value: "uncut_produce", placeholder: "果蔬状态未确认", label: "确认是未切开的果蔬" };
  }
  return null;
}

const fallbackTargetPlan = {
  targetDish: {
    name: "想吃的菜",
    intentTime: "tonight",
    coreTaste: "按你想吃的口味来",
    estimatedTime: "30-45 分钟",
    difficulty: "中等",
  },
  verdict: {
    title: "先看看家里够不够做",
    summary: "我会先尊重你想吃的菜，再看冰箱里现有材料够不够、今晚做起来麻不麻烦。",
    primaryAction: "cook_simplified",
  },
  inventoryMatch: {
    availableItems: [],
    missingCritical: ["关键主料"],
    missingOptional: ["常用调味料"],
    substitutions: [],
    coverageStatus: "unresolved",
    needsConfirmationItems: [],
  },
  shoppingPlan: {
    mustBuy: [],
    confirmAtHome: ["食用油", "盐", "酱油"],
    optionalUpgrades: [],
  },
  executionPlan: {
    recommendedVersion: "先确认主料够不够，缺主料时不要硬凑成另一道菜。",
    steps: ["确认这道菜最重要的主料。", "核对冰箱里已有材料。", "缺主料时先补买，或者改成相近口味的热食。", "按你确认的时间控制步骤复杂度。"],
    difficultyWarnings: ["当前是保守兜底方案，关键材料还需要你确认。"],
    prepForTomorrow: "如果今天材料不齐，可以把主料加入明天补买清单。",
  },
  userFit: {
    skillNote: "对新手来说，完整版偏难。",
    timeNote: "当前时间更适合简化热食。",
    profileNotes: [],
  },
  commerceCards: [
    {
      type: "douyin_mall",
      title: "顺手补点材料",
      item: "关键主料",
      reason: "少了主料，这道菜做出来味道会差很多。",
      cta: "模拟去看看",
    },
  ],
  talkTrack: "",
};

function inferMealSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 22) return "dinner";
  return "late";
}

function mapIntentTime(mealSlot) {
  if (mealSlot === "late" || mealSlot === "dinner") return "tonight";
  if (mealSlot === "breakfast") return "today";
  return "today";
}

function loadingPhase(label, seconds) {
  if (/识别冰箱|识别你想吃的菜/.test(label)) {
    if (seconds < 3) return "正在压缩并发送图片";
    if (seconds < 18) return "视觉模型正在理解画面";
    if (seconds < 45) return "仍在识别，可继续等待";
    return "网络较慢，固定示例会自动使用可审计缓存";
  }
  if (/看家里够不够做|生成最适合/.test(label)) {
    if (seconds < 3) return "正在整理库存和明确约束";
    if (seconds < 16) return "正在判断做法、缺料和时间匹配";
    return "正在生成可执行步骤和安全提醒";
  }
  return "正在准备当前步骤";
}

async function postJson(url, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 60000;
  const requestId = createAgentRequestId();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...agentSessionHeaders(requestId) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(data.error || data.detail || `请求失败：${response.status}`);
      requestError.code = data.code || (response.status === 504 ? "MODEL_TIMEOUT" : "HTTP_ERROR");
      requestError.status = response.status;
      requestError.requestId = data.requestId || "";
      throw requestError;
    }
    return {
      ...data,
      requestId: data.requestId || response.headers.get("x-request-id") || "",
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("请求超时");
      timeoutError.code = "CLIENT_TIMEOUT";
      timeoutError.requestId = requestId;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function modelGeneration(data, startedAt) {
  return {
    source: data?.source || "model",
    elapsedMs: Number(data?.trace?.totalMs) || Date.now() - startedAt,
    requestId: data?.requestId || "",
  };
}

function fallbackGeneration(error, startedAt) {
  const timeout = error?.code === "MODEL_TIMEOUT"
    || error?.code === "CLIENT_TIMEOUT"
    || /超时|timeout/i.test(String(error?.message || ""));
  return {
    source: timeout ? "timeout-rules" : "error-rules",
    elapsedMs: Date.now() - startedAt,
    reason: timeout ? "上游模型未在时限内完成" : "上游模型本次调用失败",
    requestId: error?.requestId || "",
  };
}

async function fetchDemoFile(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("示例图片加载失败");
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

function compressImage(file, maxSide = 1400, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("图片读取失败")));
    reader.addEventListener("load", () => {
      const img = new Image();
      img.addEventListener("error", () => reject(new Error("图片解析失败")));
      img.addEventListener("load", () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      });
      img.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}

function normalizeShoppingItems(items, fallbackNames = []) {
  const source = Array.isArray(items) ? items : fallbackNames.map((item) => ({ item, reason: "做完整版需要补上这项材料。" }));
  return source
    .map((entry) => (typeof entry === "string" ? { item: entry, reason: "做完整版需要补上这项材料。" } : entry))
    .map((entry) => ({ item: String(entry?.item || "").trim(), reason: String(entry?.reason || "做完整版需要补上这项材料。").trim() }))
    .filter((entry) => entry.item && entry.item !== "无")
    .slice(0, 8);
}

function normalizeTargetPlan(plan, context = null) {
  const inventoryMatch = { ...fallbackTargetPlan.inventoryMatch, ...plan?.inventoryMatch };
  const shoppingPlan = plan?.shoppingPlan || {};
  const normalized = {
    ...fallbackTargetPlan,
    ...plan,
    targetDish: { ...fallbackTargetPlan.targetDish, ...plan?.targetDish },
    verdict: { ...fallbackTargetPlan.verdict, ...plan?.verdict },
    inventoryMatch,
    shoppingPlan: {
      mustBuy: normalizeShoppingItems(shoppingPlan.mustBuy, namesOf(inventoryMatch.missingCritical, 8)),
      confirmAtHome: namesOf(shoppingPlan.confirmAtHome || fallbackTargetPlan.shoppingPlan.confirmAtHome, 6),
      optionalUpgrades: namesOf(shoppingPlan.optionalUpgrades || inventoryMatch.missingOptional, 6),
    },
    executionPlan: { ...fallbackTargetPlan.executionPlan, ...plan?.executionPlan },
    userFit: { ...fallbackTargetPlan.userFit, ...plan?.userFit },
    commerceCards: Array.isArray(plan?.commerceCards) ? plan.commerceCards : fallbackTargetPlan.commerceCards,
  };
  return context ? guardTargetPlanIntegrity(normalized, context) : normalized;
}

function fallbackLifeLogDraft(mealName) {
  const dishName = String(mealName || "今晚这顿饭").trim().slice(0, 40) || "今晚这顿饭";
  return {
    dishName,
    confidence: 0,
    visualSummary: "已保留成品图，请根据画面确认下面的文字。",
    titleOptions: [`今晚的${dishName}，先留个记录`, `从想吃到开饭：${dishName}`],
    coverText: "今晚这顿自己做",
    voiceoverDraft: `今晚做了${dishName}，成品先留个记录。图片里的细节和实际做法请在发布前按真实情况补充。`,
    suggestedShots: [
      { shot: "补拍成品近景", onScreenText: "今晚开饭" },
      { shot: "补拍本次实际使用的食材", onScreenText: "家里现有的材料" },
    ],
    tags: ["#今晚吃什么", "#冰箱晚餐", "#生活记录"],
    warnings: ["这是可编辑兜底草稿，请确认菜名和事实后再发布。"],
  };
}

function normalizeLifeLogDraft(value, mealName) {
  const fallback = fallbackLifeLogDraft(mealName);
  const draft = value && typeof value === "object" ? value : {};
  const titleOptions = Array.isArray(draft.titleOptions)
    ? draft.titleOptions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  const suggestedShots = Array.isArray(draft.suggestedShots)
    ? draft.suggestedShots.filter((item) => item?.shot).slice(0, 5)
    : [];
  const tags = Array.isArray(draft.tags)
    ? draft.tags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const warnings = Array.isArray(draft.warnings)
    ? draft.warnings.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  return {
    ...fallback,
    ...draft,
    titleOptions: titleOptions.length ? titleOptions : fallback.titleOptions,
    suggestedShots: suggestedShots.length ? suggestedShots : fallback.suggestedShots,
    tags: tags.length ? tags : fallback.tags,
    warnings: warnings.length ? warnings : fallback.warnings,
  };
}

function fallbackDishRescue(mealName, category, symptom) {
  const taste = category === "taste";
  const seasoning = category === "seasoning";
  const nextStep = category === "next_step";
  return {
    headline: `${mealName || "这道菜"} · 先处理“${symptom || "当前问题"}”`,
    visualObservations: ["当前网络暂不可用，下面只依据你选择的问题给出保守建议。"],
    assessment: { category, likelyIssue: symptom, confidence: "low", needsConfirmation: true },
    actions: [{
      title: nextStep ? "先确认当前阶段" : seasoning ? "一次只改一个变量" : taste ? "先取一小份调整" : "先暂停扩大问题",
      instruction: nextStep
        ? "对照原步骤，确认最近完成的动作，再只推进下一项。"
        : seasoning
          ? "少量分次加入，每次混匀并确认后再决定是否继续。"
          : taste
            ? "停止继续加调料，取一小份少量调整并由你试味，确认有效后再处理整锅。"
            : "转小火或暂时离火，保留当前状态，先做一次最小幅度调整。",
      check: "执行一次后先观察或试味，再决定下一步。",
    }],
    nextStep: "不要连续做多个调整；先确认这一次是否有效。",
    askUser: nextStep ? "你最近完成的是哪一步？锅里现在更接近生、焖煮中还是收汁中？" : "执行一次后，告诉我状态是否改善。",
    boundaryReminder: taste
      ? "味道来自你的试味和描述，不是从图片判断。"
      : "仅凭图片不能判断气味、准确用量，也不能确认肉蛋是否安全熟透。",
  };
}

function normalizeDishRescue(value, mealName, category, symptom) {
  const fallback = fallbackDishRescue(mealName, category, symptom);
  const rescue = value && typeof value === "object" ? value : {};
  const observations = Array.isArray(rescue.visualObservations)
    ? rescue.visualObservations.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const actions = Array.isArray(rescue.actions)
    ? rescue.actions.filter((item) => item?.instruction).slice(0, 3)
    : [];
  return {
    ...fallback,
    ...rescue,
    assessment: { ...fallback.assessment, ...rescue.assessment },
    visualObservations: observations.length ? observations : fallback.visualObservations,
    actions: actions.length ? actions : fallback.actions,
  };
}

function namesOf(items, limit = 5) {
  return items
    .map((item) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean)
    .slice(0, limit);
}

const ingredientIconAliases = [
  ["番茄酱", "番茄酱"],
  ["西红柿", "番茄"],
  ["番茄", "番茄"],
  ["鸡蛋", "鸡蛋"],
  ["鸡胸", "鸡胸肉"],
  ["鸡腿", "鸡胸肉"],
  ["鸡肉", "鸡胸肉"],
  ["猪肉", "猪肉"],
  ["五花肉", "猪肉"],
  ["牛肉", "牛肉"],
  ["牛腩", "牛肉"],
  ["鱼", "鱼"],
  ["虾", "虾"],
  ["豆腐", "豆腐"],
  ["黄瓜", "黄瓜"],
  ["胡萝卜", "胡萝卜"],
  ["土豆", "土豆"],
  ["马铃薯", "土豆"],
  ["蘑菇", "蘑菇"],
  ["香菇", "蘑菇"],
  ["菌菇", "蘑菇"],
  ["菠菜", "菠菜"],
  ["生菜", "菠菜"],
  ["青菜", "菠菜"],
  ["绿叶菜", "菠菜"],
  ["西兰花", "西兰花"],
  ["花菜", "西兰花"],
  ["菜花", "西兰花"],
  ["圆白菜", "菠菜"],
  ["包菜", "菠菜"],
  ["卷心菜", "菠菜"],
  ["洋葱", "洋葱"],
  ["大蒜", "大蒜"],
  ["蒜", "大蒜"],
  ["辣椒", "辣椒"],
  ["青椒", "辣椒"],
  ["面条", "面条"],
  ["挂面", "面条"],
  ["意面", "意面"],
  ["米饭", "米饭"],
  ["剩饭", "米饭"],
  ["面包", "面包"],
  ["饺子", "饺子"],
  ["速冻饺子", "饺子"],
  ["牛奶", "牛奶"],
  ["酸奶", "酸奶"],
  ["奶酪", "奶酪"],
  ["黄油", "黄油"],
  ["酱油", "酱油"],
  ["橄榄油", "橄榄油"],
  ["玉米", "玉米"],
  ["茄子", "茄子"],
  ["苹果", "苹果"],
  ["香蕉", "香蕉"],
  ["橙子", "橙子"],
  ["葡萄", "葡萄"],
  ["草莓", "草莓"],
  ["西瓜", "西瓜"],
  ["柠檬", "柠檬"],
  ["牛油果", "牛油果"],
  ["燕麦", "燕麦"],
];

function ingredientIconName(name) {
  const normalized = String(name || "").replace(/\s+/g, "");
  const matched = ingredientIconAliases.find(([keyword]) => normalized.includes(keyword) || keyword.includes(normalized));
  return matched?.[1] || "";
}

function ingredientIconUrl(name) {
  const iconName = ingredientIconName(name);
  if (!iconName) return "";
  return `/sliced/${encodeURIComponent(iconName)}.png`;
}

function modeSample(modeId) {
  const sampleId = modeId === "explore" ? "practice" : modeId === "tired" ? "late" : "quick";
  return samples.find((sample) => sample.id === sampleId) || samples[0];
}

function formatMealSlot(slot) {
  return mealSlots.find((item) => item.id === slot)?.label || "晚餐";
}

function mealSlotHint(slot) {
  const label = formatMealSlot(slot);
  return `已按当前时间预选为${label}，可以手动改。`;
}

function mergeSpeechTranscript(currentText, transcript) {
  const current = String(currentText || "").trim();
  const incoming = String(transcript || "").trim();
  if (!current) return incoming;
  if (/我?(今天|今晚|明天|早餐|午餐|晚餐|夜宵)?(想吃|想做|要做)/.test(incoming)) return incoming;
  return `${current.replace(/[，。；;\s]+$/g, "")}，${incoming}`;
}

function extractDishName(text) {
  return String(text || "")
    .replace(/我(今天|今晚|明天|这周|早餐|午餐|晚餐|夜宵)?(想吃|想做|要做|想复刻|复刻|想来一份)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 18) || "目标菜";
}

function inferDishNameFromFileName(fileName) {
  const baseName = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\u4e00-\u9fff]/.test(baseName)) return "";
  if (baseName.length > 18) return "";
  return cleanDishName(baseName);
}

function cleanDishName(name) {
  const cleaned = String(name || "")
    .replace(/^(疑似|可能是|可能为|大概率是|待确认目标菜[:：]?)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleaned) return "";
  if (/^(模型结果|目标菜|目标菜待确认|待确认|未知|未知菜品|无法确定|不确定|菜品|食物|图片|照片)$/i.test(cleaned)) return "";
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 18);
}

function dishNamesMatch(a, b) {
  const left = cleanDishName(a);
  const right = cleanDishName(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function dishKnowledge(dishName) {
  if (/豌杂面|碗杂面/.test(dishName)) {
    return {
      name: "豌杂面",
      coreTaste: "麻辣咸香、豌豆绵软、肉酱下饭",
      estimatedTime: "25-40 分钟",
      difficulty: "中等",
      required: ["面条", "猪肉", "豌豆", "芽菜"],
      pantry: ["食用油", "盐", "酱油", "醋"],
      optional: ["辣椒油", "花椒粉", "芝麻酱", "葱"],
      steps: ["先把豌豆煮软或准备好熟豌豆。", "猪肉末炒散，加入芽菜和酱油做成杂酱。", "碗底按口味放酱油、醋和辣椒油。", "面条煮熟后加豌豆与杂酱，拌匀再确认咸辣度。"],
      warning: "豌豆和杂酱都需要提前准备；如果缺猪肉末、豌豆或芽菜，只能做成普通拌面，不能说是完整豌杂面。",
    };
  }

  if (/黄焖鸡/.test(dishName)) {
    return {
      name: "黄焖鸡",
      coreTaste: "咸香微甜、热乎下饭",
      estimatedTime: "35-45 分钟",
      difficulty: "中等",
      required: ["鸡腿肉", "土豆", "香菇", "青椒"],
      optional: ["姜", "蒜", "米饭"],
      steps: ["鸡腿肉切块后焯水或煎到变色。", "土豆和香菇下锅翻炒，加入酱油和少量糖。", "加水焖到鸡肉熟透、土豆变软。", "最后放青椒收汁，配米饭最稳。"],
      warning: "黄焖鸡的关键是鸡肉熟透和焖煮时间；如果没有鸡肉，不建议硬说成完整黄焖鸡。",
    };
  }

  if (/回锅肉/.test(dishName)) {
    return {
      name: "回锅肉",
      coreTaste: "咸香微辣、下饭",
      estimatedTime: "35-45 分钟",
      difficulty: "中等偏难",
      required: ["五花肉", "青椒", "蒜苗", "豆瓣酱"],
      optional: ["姜", "蒜", "洋葱"],
      steps: ["五花肉先煮到断生，放凉后切薄片。", "少油煸出肉片油脂。", "加入豆瓣酱炒出红油。", "放青椒或蒜苗快速翻炒，最后简单调味。"],
      warning: "回锅肉需要先煮再炒，对刀工和火候有一点要求；如果没有五花肉，可以先补买，不要用鸡蛋硬替代成回锅肉。",
    };
  }

  if (/鱼香肉丝/.test(dishName)) {
    return {
      name: "鱼香肉丝",
      coreTaste: "酸甜咸香、微辣、下饭",
      estimatedTime: "30-40 分钟",
      difficulty: "中等",
      required: ["猪肉", "胡萝卜", "木耳", "辣椒"],
      optional: ["豆瓣酱", "醋", "酱油", "白糖", "姜", "蒜", "米饭"],
      steps: ["猪肉切细条，用少量酱油和淀粉抓匀。", "胡萝卜、木耳和辣椒切丝备用。", "先把肉丝滑炒到变色后盛出。", "用豆瓣酱、醋、酱油和少量糖调出鱼香味，再把肉丝和配菜回锅炒匀。"],
      warning: "鱼香肉丝的关键是肉丝别炒老、酸甜咸的调味比例要稳；如果没有猪肉或木耳，不建议硬说成完整鱼香肉丝。",
    };
  }

  if (/宫保鸡丁/.test(dishName)) {
    return {
      name: "宫保鸡丁",
      coreTaste: "酸甜微辣、花生香、下饭",
      estimatedTime: "30-40 分钟",
      difficulty: "中等",
      required: ["鸡胸肉", "花生", "辣椒", "黄瓜"],
      optional: ["葱", "姜", "蒜", "醋", "酱油", "白糖", "米饭"],
      steps: ["鸡胸肉切丁，用少量酱油和淀粉抓匀。", "黄瓜切丁，花生准备好。", "先把鸡丁炒到变色后盛出。", "用醋、酱油和少量糖调味，鸡丁回锅后放黄瓜和花生快速炒匀。"],
      warning: "宫保鸡丁要快炒，鸡丁别炒老；如果没有鸡肉或花生，就不要硬说成完整宫保鸡丁。",
    };
  }

  if (/麻婆豆腐/.test(dishName)) {
    return {
      name: "麻婆豆腐",
      coreTaste: "麻辣咸香、热乎下饭",
      estimatedTime: "20-30 分钟",
      difficulty: "入门到中等",
      required: ["豆腐", "豆瓣酱", "猪肉"],
      optional: ["花椒", "辣椒", "葱", "蒜", "米饭"],
      steps: ["豆腐切块，用热水轻轻焯一下。", "少油炒香肉末和豆瓣酱。", "加水煮开后放豆腐，小火煮到入味。", "最后勾一点薄芡，撒葱花或花椒粉。"],
      warning: "豆腐容易碎，新手尽量少翻动；如果没有肉末，也可以做素版麻婆豆腐。",
    };
  }

  if (/番茄炒蛋|西红柿炒鸡蛋|番茄鸡蛋/.test(dishName)) {
    return {
      name: "番茄炒蛋",
      coreTaste: "酸甜热乎、家常下饭",
      estimatedTime: "10-15 分钟",
      difficulty: "新手友好",
      required: ["番茄", "鸡蛋"],
      optional: ["葱", "米饭", "面条"],
      steps: ["鸡蛋打散，先炒到刚凝固后盛出。", "番茄切块，下锅炒出汁。", "把鸡蛋倒回锅里，加一点盐和少量糖调味。", "如果想更抗饿，可以配米饭或加面条。"],
      warning: "番茄炒蛋很适合新手，重点是别把鸡蛋炒太老。",
    };
  }

  if (/番茄.*面|西红柿.*面/.test(dishName)) {
    return {
      name: "番茄鸡蛋面",
      coreTaste: "酸甜热汤、暖胃省事",
      estimatedTime: "12-18 分钟",
      difficulty: "新手友好",
      required: ["番茄", "鸡蛋", "面条"],
      optional: ["青菜", "葱", "酱油"],
      steps: ["番茄切块，下锅炒出汤汁。", "加水煮开后下面条。", "面条快熟时打入鸡蛋或倒入蛋液。", "最后放一点青菜和盐调味。"],
      warning: "这道适合赶时间，注意面条别煮过头。",
    };
  }

  if (/青椒肉丝/.test(dishName)) {
    return {
      name: "青椒肉丝",
      coreTaste: "咸香微辣、快手下饭",
      estimatedTime: "20-30 分钟",
      difficulty: "中等",
      required: ["猪肉", "辣椒"],
      optional: ["酱油", "蒜", "姜", "米饭"],
      steps: ["猪肉切丝，用少量酱油和淀粉抓匀。", "辣椒切丝。", "先炒肉丝到变色后盛出。", "再炒辣椒，最后肉丝回锅调味。"],
      warning: "肉丝别炒太久，辣椒下锅后保持中大火更香。",
    };
  }

  if (/土豆.*牛肉|牛肉.*土豆|土豆炖牛肉/.test(dishName)) {
    return {
      name: "土豆炖牛肉",
      coreTaste: "热乎、咸香、抗饿",
      estimatedTime: "60 分钟以上",
      difficulty: "偏难",
      required: ["牛肉", "土豆"],
      optional: ["番茄", "洋葱", "胡萝卜", "姜", "蒜"],
      steps: ["牛肉切块后焯水。", "土豆切块备用。", "先把牛肉加水炖到变软。", "再放土豆继续炖到软糯并调味。"],
      warning: "牛肉炖菜耗时较长，不适合只剩 25 分钟时从零开始。",
    };
  }

  if (/可乐鸡翅|鸡翅/.test(dishName)) {
    return {
      name: "可乐鸡翅",
      coreTaste: "咸甜、酱香、适合配饭",
      estimatedTime: "30-40 分钟",
      difficulty: "入门到中等",
      required: ["鸡翅"],
      optional: ["酱油", "姜", "可乐", "米饭"],
      steps: ["鸡翅洗净后两面划口。", "先把鸡翅煎到表面微黄。", "加入酱油、姜片和可乐，小火焖煮。", "最后开盖收汁，确认鸡翅完全熟透。"],
      warning: "鸡翅必须彻底熟透；如果没有可乐，也可以做酱油焖鸡翅。",
    };
  }

  if (/蛋炒饭|炒饭/.test(dishName)) {
    return {
      name: "蛋炒饭",
      coreTaste: "咸香、快手、抗饿",
      estimatedTime: "10-15 分钟",
      difficulty: "新手友好",
      required: ["米饭", "鸡蛋"],
      optional: ["葱", "胡萝卜", "青菜", "酱油"],
      steps: ["鸡蛋打散先炒成小块。", "加入米饭炒散。", "有胡萝卜或青菜可以切碎一起炒。", "最后用盐或少量酱油调味。"],
      warning: "剩米饭更适合炒饭；米饭太湿时容易结块。",
    };
  }

  if (/番茄.*牛腩|牛腩/.test(dishName)) {
    return {
      name: "番茄牛腩",
      coreTaste: "酸甜、热乎、下饭",
      estimatedTime: "60 分钟以上",
      difficulty: "偏难",
      required: ["牛腩", "番茄", "土豆"],
      optional: ["洋葱", "八角", "香叶"],
      steps: ["牛腩焯水去浮沫。", "番茄炒出汤底。", "加入牛腩和热水炖煮。", "最后加入土豆炖软并调味。"],
      warning: "番茄牛腩需要较长炖煮时间，时间不足时更适合拆成番茄汤面或明天再做完整版。",
    };
  }

  if (/羊肉烩面|羊肉烩面片|河南烩面/.test(dishName)) {
    return {
      name: "羊肉烩面",
      coreTaste: "羊汤鲜香、宽面筋道、热乎饱腹",
      estimatedTime: "使用现成高汤约 35-45 分钟；从零炖羊汤需要更久",
      difficulty: "中等偏难",
      required: ["羊肉", "烩面片"],
      pantry: ["盐", "姜", "葱"],
      optional: ["香菜", "蒜苗", "胡椒粉", "羊汤或高汤"],
      steps: ["先确认有羊肉和烩面片；没有这两项时不要说主要材料够了。", "使用现成羊汤或高汤时先煮羊肉和汤底。", "烩面片拉开或切宽后下锅煮熟。", "最后按实际口味加入盐、胡椒粉、香菜或蒜苗。"],
      warning: "菜图不能确认冰箱里的肉类身份；羊肉和面片必须以用户确认库存为准。",
    };
  }

  return {
    name: dishName || "想吃的菜",
    coreTaste: "按你想吃的口味来",
    estimatedTime: "30-45 分钟",
    difficulty: "中等",
    required: [],
    optional: ["常用调味料"],
    steps: ["先确认这道菜最重要的主料是什么。", "再和冰箱里的现有食材对一下。", "如果主料不明确，先不要硬凑成另一道菜。", "可以补充一句“我有猪肉/鸡蛋/面条”，再重新判断。"],
    warning: "当前只知道你想吃这道菜，但缺少更具体的主料信息；可以补充主料或换成已有食材能做的菜。",
  };
}

function ingredientMatches(ingredient, inventoryNames) {
  return findIngredientMatch(ingredient, inventoryNames);
}

function userText(text) {
  return String(text || "")
    .replace(/目标菜/g, "这道菜")
    .replace(/关键缺口/g, "还差的材料")
    .replace(/核心缺口/g, "主要缺的材料")
    .replace(/补齐/g, "补上")
    .replace(/尽量复刻/g, "尽量做出那个味道")
    .replace(/复刻/g, "照着做");
}

function guardTargetPlanIntegrity(plan, { text, imageAnalysis, inventory } = {}) {
  const inventoryNames = namesOf(sanitizeClientInventory(inventory), 32);
  const targetName = cleanDishName(plan?.targetDish?.name)
    || cleanDishName(extractDishName(text))
    || cleanDishName(imageAnalysis?.dishName);
  const knowledge = dishKnowledge(targetName);
  const knownRequiredItems = knowledge.required.length > 0;
  const existingMissing = namesOf(plan?.inventoryMatch?.missingCritical, 8)
    .filter((item) => !/^(关键|主要|核心)?主料$/.test(item));
  const needsConfirmationItems = namesOf(
    plan?.inventoryMatch?.needsConfirmationItems || imageAnalysis?.likelyIngredients,
    6,
  );

  if (!knownRequiredItems) {
    const coverageStatus = deriveUnknownCoverageStatus(existingMissing);
    return {
      ...plan,
      inventoryMatch: {
        ...plan.inventoryMatch,
        availableItems: namesOf(plan.inventoryMatch.availableItems, 8)
          .filter((item) => inventoryNames.some((name) => name.includes(item) || item.includes(name))),
        missingCritical: existingMissing,
        coverageStatus,
        needsConfirmationItems,
      },
      verdict: coverageStatus === "unresolved"
        ? {
            ...plan.verdict,
            title: `想吃${knowledge.name}，还需要确认主料`,
            summary: `你想吃的是${knowledge.name}，但目前还没有足够依据判断主要材料是否齐全。先补充主料信息，或补拍看不清的包装，再决定是直接做还是补买。`,
            primaryAction: "shop_then_cook",
          }
        : plan.verdict,
    };
  }

  const { availableItems, missingCritical, coverageStatus } = resolveRequiredCoverage(knowledge.required, inventoryNames);
  const existingMustBuy = normalizeShoppingItems(plan.shoppingPlan?.mustBuy, []);
  const mustBuyByName = new Map(existingMustBuy.map((item) => [item.item, item]));
  const mustBuy = missingCritical.map((item) => mustBuyByName.get(item) || {
    item,
    reason: `做完整的${knowledge.name}需要这项材料。`,
  });

  return {
    ...plan,
    targetDish: { ...plan.targetDish, name: knowledge.name },
    inventoryMatch: {
      ...plan.inventoryMatch,
      availableItems: [...new Set(availableItems)],
      missingCritical,
      coverageStatus,
      needsConfirmationItems: [],
    },
    shoppingPlan: {
      ...plan.shoppingPlan,
      mustBuy,
    },
    verdict: missingCritical.length
      ? {
          ...plan.verdict,
          title: `想吃${knowledge.name}，家里还差几样`,
          summary: `你想吃的是${knowledge.name}。按人工确认的库存核对后，还缺 ${missingCritical.join("、")}；补上再做，或者改成现有食材能完成的菜。`,
          primaryAction: "shop_then_cook",
        }
      : {
          ...plan.verdict,
          title: `家里材料够，可以做一版${knowledge.name}`,
          primaryAction: plan.verdict?.primaryAction === "shop_then_cook" ? "cook_now" : plan.verdict?.primaryAction,
        },
    executionPlan: missingCritical.length
      ? {
          ...plan.executionPlan,
          recommendedVersion: `先补 ${missingCritical.slice(0, 3).join("、")}，再做${knowledge.name}；不补买就改做现有库存能完成的菜。`,
        }
      : plan.executionPlan,
  };
}

function createTargetFallbackPlan({ text, imageAnalysis, inventory, mealSlot, availableTime }) {
  const inferredName = cleanDishName(extractDishName(text)) || cleanDishName(imageAnalysis?.dishName);
  const knowledge = dishKnowledge(inferredName);
  const inventoryNames = namesOf(inventory, 24);
  const availableItems = [];
  const missingCritical = [];
  const knownRequiredItems = knowledge.required.length > 0;

  knowledge.required.forEach((item) => {
    const matched = ingredientMatches(item, inventoryNames);
    if (matched) availableItems.push(matched);
    else missingCritical.push(item);
  });
  const missingOptional = knowledge.optional.filter((item) => !ingredientMatches(item, inventoryNames));

  const title = !knownRequiredItems
    ? `想吃${knowledge.name}，还需要确认主料`
    : missingCritical.length
    ? `想吃${knowledge.name}，家里还差几样`
    : `家里材料够，可以做一版${knowledge.name}`;

  return normalizeTargetPlan({
    targetDish: {
      name: knowledge.name,
      intentTime: mapIntentTime(mealSlot),
      coreTaste: imageAnalysis?.coreTaste || knowledge.coreTaste,
      estimatedTime: imageAnalysis?.estimatedTime || knowledge.estimatedTime,
      difficulty: imageAnalysis?.difficulty || knowledge.difficulty,
    },
    verdict: {
      title,
      summary: !knownRequiredItems
        ? `你想吃的是${knowledge.name}。我还不确定这道菜最关键的主料和调味，先别把整道菜当成购物项；可以补充“家里有猪肉/鸡蛋/面条”等信息后再判断。`
        : missingCritical.length
        ? `你想吃的是${knowledge.name}。现在家里还少 ${missingCritical.join("、")}；不补买的话，可以先做相近口味的简化热食，但就不能算完整的${knowledge.name}。`
        : `你想吃的是${knowledge.name}。家里主要材料够，可以按简化步骤做一版。`,
      primaryAction: !knownRequiredItems || missingCritical.length ? "shop_then_cook" : "cook_now",
    },
    inventoryMatch: {
      availableItems: availableItems.length ? availableItems : inventoryNames.slice(0, 4),
      missingCritical: knownRequiredItems ? missingCritical : [],
      missingOptional,
      substitutions: [],
      coverageStatus: knownRequiredItems ? (missingCritical.length ? "missing" : "enough") : "unresolved",
      needsConfirmationItems: knownRequiredItems ? [] : namesOf(imageAnalysis?.likelyIngredients, 6),
    },
    shoppingPlan: {
      mustBuy: knownRequiredItems ? missingCritical.map((item) => ({ item, reason: `做完整的${knowledge.name}需要这项材料。` })) : [],
      confirmAtHome: namesOf(knowledge.pantry || ["食用油", "盐", "酱油"], 6)
        .filter((item) => !ingredientMatches(item, inventoryNames)),
      optionalUpgrades: missingOptional,
    },
    executionPlan: {
      recommendedVersion: missingCritical.length
        ? `先补 ${missingCritical.slice(0, 3).join("、")}，再做${knowledge.name}；如果不补买，就改成现有食材的相近口味热食。`
        : !knownRequiredItems
        ? `先确认${knowledge.name}需要的主料，再看家里够不够做；不要把菜名本身当成要买的东西。`
        : `用现有食材做一版${knowledge.name}，按 ${availableTime} 控制步骤。`,
      steps: knowledge.steps,
      difficultyWarnings: [knowledge.warning],
      prepForTomorrow: missingCritical.length ? `把 ${missingCritical.slice(0, 3).join("、")} 加入补买清单，明天照着做会更稳。` : "如果今天时间不够，可以把切配留到明天再做完整版。",
    },
    userFit: {
      skillNote: knowledge.difficulty.includes("难") ? "这道菜对新手略有挑战，建议用简化步骤。" : "这道菜可以按简化版执行。",
      timeNote: `当前确认的可支配时间是 ${availableTime}。`,
      profileNotes: ["已按用户确认的餐次和时间约束生成。"],
    },
    commerceCards: knownRequiredItems ? missingCritical.slice(0, 2).map((item) => ({
      type: "douyin_mall",
      title: "顺手补点材料",
      item,
      reason: `做${knowledge.name}少不了${item}，没有它味道会差一截。`,
      cta: "模拟去看看",
    })) : [],
  }, { text, imageAnalysis, inventory });
}

export default function App() {
  const [stage, setStage] = useState("entry");
  const [entryMode, setEntryMode] = useState(null);
  const [modeId, setModeId] = useState("busy");
  const [mealSlot, setMealSlot] = useState(inferMealSlot());
  const [availableTime, setAvailableTime] = useState(modeCards[0].time);
  const [fridgeImage, setFridgeImage] = useState("");
  const [fridgeFileName, setFridgeFileName] = useState("");
  const [targetImage, setTargetImage] = useState("");
  const [targetImageFileName, setTargetImageFileName] = useState("");
  const [targetOriginalImage, setTargetOriginalImage] = useState("");
  const [targetOriginalFileName, setTargetOriginalFileName] = useState("");
  const [targetFocusOpen, setTargetFocusOpen] = useState(false);
  const [targetImageDishName, setTargetImageDishName] = useState("");
  const [targetImageAnalysis, setTargetImageAnalysis] = useState(null);
  const [targetImageStatus, setTargetImageStatus] = useState("");
  const [vision, setVision] = useState(null);
  const [confirmedNames, setConfirmedNames] = useState([]);
  const [rescueExpanded, setRescueExpanded] = useState(false);
  const [itemUrgencies, setItemUrgencies] = useState({});
  const [itemStorageConfirmations, setItemStorageConfirmations] = useState({});
  const [dismissedUncertaintyKeys, setDismissedUncertaintyKeys] = useState([]);
  const [reshootStatus, setReshootStatus] = useState("");
  const [intent, setIntent] = useState("recommend");
  const [targetText, setTargetText] = useState("");
  const [targetTextSource, setTargetTextSource] = useState("");
  const [result, setResult] = useState(null);
  const [planHistory, setPlanHistory] = useState([]);
  const [confirmedInventorySnapshot, setConfirmedInventorySnapshot] = useState(() => readConfirmedInventorySnapshot());
  const [sessionFeedbackType, setSessionFeedbackType] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [loading, setLoading] = useState("");
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const fridgeInputRef = useRef(null);
  const fridgeCameraInputRef = useRef(null);
  const reshootInputRef = useRef(null);
  const reshootCameraInputRef = useRef(null);
  const targetInputRef = useRef(null);
  const targetCameraInputRef = useRef(null);
  const planSequenceRef = useRef(0);

  const selectedMode = useMemo(() => modeCards.find((mode) => mode.id === modeId) || modeCards[0], [modeId]);
  const confirmedInventory = useMemo(() => {
    const currentVision = vision || normalizeVision(modeSample(modeId).vision);
    return currentVision.items.filter((item) => confirmedNames.includes(item.name));
  }, [confirmedNames, modeId, vision]);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 1800);
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  function setMode(nextModeId) {
    const nextMode = modeCards.find((mode) => mode.id === nextModeId) || modeCards[0];
    setModeId(nextModeId);
    setAvailableTime(nextMode.time);
  }

  function buildUserContext({ alternative = false } = {}) {
    const feedbackPreferences = [];
    const feedbackAvoid = [];
    let feedbackGoal = "";

    if (sessionFeedbackType === "too_complex") {
      feedbackPreferences.push("更少步骤", "新手可执行");
      feedbackAvoid.push("复杂步骤", "长时间备菜");
      feedbackGoal = "上一版太麻烦，这一轮必须明显降低步骤和操作难度";
    } else if (sessionFeedbackType === "too_many_missing") {
      feedbackPreferences.push("优先只用现有库存");
      feedbackAvoid.push("额外补买", "依赖缺失主料");
      feedbackGoal = "上一版缺料太多，这一轮优先用已经确认的食材完成一餐";
    } else if (sessionFeedbackType === "low_cleanup") {
      feedbackPreferences.push("少洗锅", "一锅完成");
      feedbackAvoid.push("多锅并行", "复杂清洗");
      feedbackGoal = "上一版清洗负担太高，这一轮优先一锅完成";
    } else if (sessionFeedbackType === "lighter_taste") {
      feedbackPreferences.push("清淡", "少油");
      feedbackAvoid.push("重油", "重辣");
      feedbackGoal = "上一版口味偏重，这一轮需要更清淡少油";
    }

    if (alternative) {
      feedbackPreferences.push("与上一版不同但同样可执行");
      feedbackGoal = feedbackGoal
        ? `${feedbackGoal}；同时给出与上一版不同的可执行版本`
        : "这次需要给出与上一版不同、但仍符合当前库存和时间的可执行版本";
    }

    return {
      user: {
        name: "展示用户",
        cookingLevel: selectedMode.cookingLevel,
        preferences: [...new Set([...selectedMode.preferences, ...feedbackPreferences])],
        avoid: [...new Set([...selectedMode.avoid, ...feedbackAvoid])],
        recentMeals: [],
        goal: `${formatMealSlot(mealSlot)}：${selectedMode.goal}${feedbackGoal ? `；${feedbackGoal}` : ""}`,
      },
      context: {
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        mealSlot: formatMealSlot(mealSlot),
        availableCookingTime: availableTime,
        energyLevel: selectedMode.energy,
        nextSchedule: "由用户确认",
      },
    };
  }

  async function handleFridgeFile(event) {
    const [file] = event.target.files;
    if (!file) return;
    try {
      setFridgeFileName(file.name);
      setFridgeImage(await compressImage(file));
      setRescueExpanded(false);
      setItemUrgencies({});
      setItemStorageConfirmations({});
      setDismissedUncertaintyKeys([]);
      setReshootStatus("");
    } catch (error) {
      setFridgeFileName("");
      showToast(error.message || "图片读取失败");
    } finally {
      event.target.value = "";
    }
  }

  async function loadDemoFridge() {
    try {
      setLoading("正在载入示例冰箱");
      const file = await fetchDemoFile(
        "/demo-assets/fridge-images/f63de1c0794c76a412b9f06f0d919044.png",
        "f63de1c0794c76a412b9f06f0d919044.png",
      );
      setFridgeFileName(file.name);
      setFridgeImage(await compressImage(file));
      setRescueExpanded(false);
      setItemUrgencies({});
      setItemStorageConfirmations({});
      setDismissedUncertaintyKeys([]);
      setReshootStatus("");
      showToast("示例冰箱已载入");
    } catch (error) {
      showToast(error.message || "示例图片加载失败");
    } finally {
      setLoading("");
    }
  }

  async function handleTargetFile(event) {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const inferredDishName = inferDishNameFromFileName(file.name);
      const imageDataUrl = await compressImage(file);
      setTargetImageFileName(file.name);
      setTargetImage(imageDataUrl);
      setTargetOriginalFileName(file.name);
      setTargetOriginalImage(imageDataUrl);
      setTargetFocusOpen(false);
      setTargetImageDishName(inferredDishName);
      setTargetImageAnalysis(null);
      setTargetImageStatus("正在识别菜名，稍后可手动修改。");
      await analyzeTargetImage({
        imageDataUrl,
        fileName: file.name,
        fallbackDishName: inferredDishName,
        shouldOverwriteText: !targetText.trim() || targetTextSource !== "manual",
      });
    } catch (error) {
      setTargetImageFileName("");
      setTargetImageAnalysis(null);
      setTargetImageStatus("");
      showToast(error.message || "目标菜图片读取失败");
    } finally {
      event.target.value = "";
    }
  }

  async function loadDemoTargetDish() {
    try {
      const file = await fetchDemoFile("/demo-assets/菜/黄焖鸡-示例.png", "黄焖鸡-示例.png");
      const imageDataUrl = await compressImage(file);
      setTargetImageFileName(file.name);
      setTargetImage(imageDataUrl);
      setTargetOriginalFileName(file.name);
      setTargetOriginalImage(imageDataUrl);
      setTargetFocusOpen(false);
      setTargetImageDishName("黄焖鸡");
      setTargetImageAnalysis(null);
      setTargetImageStatus("正在识别菜名，稍后可手动修改。");
      await analyzeTargetImage({
        imageDataUrl,
        fileName: file.name,
        fallbackDishName: "黄焖鸡",
        shouldOverwriteText: true,
      });
    } catch (error) {
      setTargetImageStatus("");
      showToast(error.message || "示例菜图加载失败");
    }
  }

  async function analyzeFridge() {
    if (!fridgeImage) {
      showToast("先上传一张冰箱照片");
      return;
    }

    setLoading("正在识别冰箱里的可用食材");
    try {
      const data = await postJson("/api/analyze-fridge", { imageDataUrl: fridgeImage, sourceFileName: fridgeFileName });
      const normalized = normalizeVision(sanitizeClientVision(data.vision));
      setVision(normalized);
      setConfirmedNames(namesOf(normalized.items, 8));
      setDismissedUncertaintyKeys([]);
      setReshootStatus("");
      setStage("inventory");
    } catch (error) {
      setVision(normalizeVision({
        items: [],
        uncertainItems: [],
        warnings: ["这张真实照片没有识别成功，未使用示例库存代替。请重试或手动选择示例。"],
      }));
      setConfirmedNames([]);
      setStage("inventory");
      showToast("真实照片识别失败，未使用示例结果");
    } finally {
      setLoading("");
    }
  }

  async function handleFridgeReshootFile(event) {
    const [file] = event.target.files;
    const target = (vision?.uncertainItems || []).find((item) => !dismissedUncertaintyKeys.includes(uncertaintyKey(item)));
    if (!file || !target) {
      event.target.value = "";
      return;
    }
    try {
      setLoading("正在识别并合并补拍区域");
      setReshootStatus("");
      const imageDataUrl = await compressImage(file);
      const data = await postJson("/api/analyze-fridge", {
        imageDataUrl,
        sourceFileName: `reshoot-${file.name}`,
      });
      const merged = mergeFridgeVisionAfterReshoot(vision, data.vision, target);
      setVision(merged.vision);
      setConfirmedNames((current) => [...new Set([...current, ...merged.addedNames])]);
      setReshootStatus(merged.resolvedTarget
        ? `补拍后新确认：${merged.addedNames.join("、")}。已并入当前库存，请再点选确认。`
        : "这次补拍仍没确认出新食材，原不确定项已保留。可以换角度再拍，或先跳过。");
    } catch (error) {
      setReshootStatus("补拍识别失败，原库存和不确定项都已保留。可以稍后重试。");
    } finally {
      event.target.value = "";
      setLoading("");
    }
  }

  function toggleIngredient(name) {
    setConfirmedNames((current) => (
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    ));
  }

  function setIngredientStatus(name, status) {
    setItemUrgencies((current) => {
      const next = { ...current };
      if (status === "no_reminder") delete next[name];
      else next[name] = status;
      return next;
    });
  }

  function setStorageConfirmation(name, confirmation) {
    setItemStorageConfirmations((current) => {
      const next = { ...current };
      if (confirmation === "not_confirmed") delete next[name];
      else next[name] = confirmation;
      return next;
    });
  }

  function saveConfirmedInventorySnapshot(inventory) {
    if (!inventory.length) return;
    const snapshot = {
      confirmedAt: new Date().toISOString(),
      items: inventory.slice(0, 20).map((item) => ({
        name: String(item.name || "").trim(),
        category: String(item.category || "").trim(),
        quantityEstimate: String(item.quantityEstimate || "").trim(),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 1,
        state: String(item.state || "用户确认可用").trim(),
        notes: String(item.notes || "").trim(),
      })).filter((item) => item.name),
    };
    if (!snapshot.items.length) return;
    try {
      window.localStorage.setItem(CONFIRMED_INVENTORY_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage may be unavailable in private browsing; current planning still continues.
    }
    setConfirmedInventorySnapshot(snapshot);
  }

  function useConfirmedInventorySnapshot() {
    if (!confirmedInventorySnapshot?.items?.length) return;
    const snapshotVision = normalizeVision({
      items: sanitizeClientInventory(confirmedInventorySnapshot.items),
      uncertainItems: [],
      warnings: ["这是上次人工确认的库存，不代表当前仍然存在。"],
    });
    setVision(snapshotVision);
    setConfirmedNames(namesOf(snapshotVision.items, 20));
    setFridgeImage("");
    setFridgeFileName("");
    setRescueExpanded(false);
    setItemUrgencies({});
    setItemStorageConfirmations({});
    setDismissedUncertaintyKeys([]);
    setReshootStatus("");
    setStage("inventory");
    showToast("已载入上次确认库存，请按现在情况增删");
  }

  function clearConfirmedInventorySnapshot() {
    try {
      window.localStorage.removeItem(CONFIRMED_INVENTORY_SNAPSHOT_KEY);
    } catch {
      // Keep the current session usable even when storage access is blocked.
    }
    setConfirmedInventorySnapshot(null);
  }

  async function prepareFridgeRescueContext(inventory, userContext) {
    const itemStates = inventory
      .map((item) => ({ name: item.name, status: itemUrgencies[item.name] || "no_reminder" }))
      .filter((item) => item.status !== "no_reminder");
    const storageConfirmations = inventory
      .map((item) => ({ name: item.name, confirmation: itemStorageConfirmations[item.name] || "not_confirmed" }))
      .filter((item) => item.confirmation !== "not_confirmed");
    const [eatFirst, organization] = await Promise.all([
      itemStates.length
        ? postJson("/api/eat-first", { itemStates }, { timeoutMs: 6000 })
            .then((data) => data.eatFirst || null)
            .catch(() => null)
        : Promise.resolve(null),
      postJson("/api/fridge-organization", { inventory, itemStates, storageConfirmations }, { timeoutMs: 6000 })
        .then((data) => data.organization || null)
        .catch(() => null),
    ]);
    const priorities = Array.isArray(eatFirst?.plannerPriorities) ? eatFirst.plannerPriorities : [];
    if (!priorities.length) return { eatFirst, organization, userContext };
    const priorityText = `本餐优先处理：${priorities.join("、")}`;
    return {
      eatFirst,
      organization,
      userContext: {
        ...userContext,
        user: {
          ...userContext.user,
          preferences: [...new Set([...(userContext.user.preferences || []), priorityText])],
          goal: `${userContext.user.goal}；用户主动确认${priorityText}`,
        },
      },
    };
  }

  function buildTargetDishRequest(shoppingDecision = null) {
    const imageAnalysis = targetImageAnalysis;
    const explicitText = targetText.trim();
    const explicitDishName = cleanDishName(extractDishName(explicitText));
    const imageDishName = cleanDishName(imageAnalysis?.dishName);
    const requestImageAnalysis = explicitDishName && imageDishName && !dishNamesMatch(explicitDishName, imageDishName)
      ? null
      : imageAnalysis;
    const text = explicitDishName
      ? explicitText
      : imageDishName
        ? `我${formatMealSlot(mealSlot)}想吃${imageDishName}`
        : "";
    return {
      text,
      imageAnalysis: requestImageAnalysis,
      targetDish: {
        text,
        intentTime: mapIntentTime(mealSlot),
        imageAnalysis: requestImageAnalysis,
        shoppingDecision,
      },
    };
  }

  async function analyzeTargetImage({
    imageDataUrl = targetImage,
    fileName = targetImageFileName,
    fallbackDishName = targetImageDishName,
    shouldOverwriteText = true,
  } = {}) {
    if (!imageDataUrl) return null;
    try {
      setLoading("正在识别你想吃的菜");
      const data = await postJson("/api/analyze-target-dish", { imageDataUrl, sourceFileName: fileName }, { timeoutMs: 25000 });
      const dishName = cleanDishName(data.targetVision?.dishName || data.targetVision?.name || "");
      if (dishName) {
        const text = `我${formatMealSlot(mealSlot)}想吃${dishName}`;
        if (shouldOverwriteText) setTargetText(text);
        if (shouldOverwriteText) setTargetTextSource("vision");
        const nextAnalysis = { ...data.targetVision, dishName };
        setTargetImageAnalysis(nextAnalysis);
        setTargetImageStatus(`识别为「${dishName}」，可以修改菜名或补充时间、口味要求。`);
        return nextAnalysis;
      }
      if (fallbackDishName) {
        showToast("菜图菜名不明确，已按文件名继续");
        const nextAnalysis = {
          ...(data.targetVision || {}),
          dishName: fallbackDishName,
          warnings: [...(data.targetVision?.warnings || []), "目标菜图片未识别出明确菜名，展示端使用文件名作为菜名兜底。"],
        };
        if (shouldOverwriteText) setTargetText(`我${formatMealSlot(mealSlot)}想吃${fallbackDishName}`);
        if (shouldOverwriteText) setTargetTextSource("fileName");
        setTargetImageAnalysis(nextAnalysis);
        setTargetImageStatus(`菜图不够明确，先按文件名「${fallbackDishName}」填入，可手动修改。`);
        return nextAnalysis;
      }
      showToast("菜图菜名不明确，请输入具体菜名");
      setTargetImageAnalysis(null);
      setTargetImageStatus("没有识别出明确菜名，请直接在文本框输入。");
      return null;
    } catch {
      if (!fallbackDishName) {
        showToast("菜图识别失败，请输入菜名后再试");
        setTargetImageAnalysis(null);
        setTargetImageStatus("菜图识别失败，请直接输入具体菜名。");
        return null;
      }
      showToast("菜图识别失败，已按文件名继续");
      const nextAnalysis = {
        dishName: fallbackDishName,
        warnings: ["目标菜图片识别失败，展示端使用文件名作为菜名兜底。"],
      };
      if (shouldOverwriteText) setTargetText(`我${formatMealSlot(mealSlot)}想吃${fallbackDishName}`);
      if (shouldOverwriteText) setTargetTextSource("fileName");
      setTargetImageAnalysis(nextAnalysis);
      setTargetImageStatus(`识别失败，先按文件名「${fallbackDishName}」填入，可手动修改。`);
      return nextAnalysis;
    } finally {
      setLoading("");
    }
  }

  async function applyTargetFocus(croppedImage) {
    const focusedFileName = `focus-${targetOriginalFileName || targetImageFileName || "target.jpg"}`;
    setTargetImage(croppedImage);
    setTargetImageFileName(focusedFileName);
    setTargetFocusOpen(false);
    setTargetImageAnalysis(null);
    setTargetImageStatus("已只保留框选区域，正在重新识别菜名。");
    await analyzeTargetImage({
      imageDataUrl: croppedImage,
      fileName: focusedFileName,
      fallbackDishName: targetImageDishName,
      shouldOverwriteText: !targetText.trim() || targetTextSource !== "manual",
    });
  }

  async function restoreTargetImage() {
    if (!targetOriginalImage) return;
    setTargetImage(targetOriginalImage);
    setTargetImageFileName(targetOriginalFileName);
    setTargetFocusOpen(false);
    setTargetImageAnalysis(null);
    setTargetImageStatus("已恢复整张画面，正在重新识别菜名。");
    await analyzeTargetImage({
      imageDataUrl: targetOriginalImage,
      fileName: targetOriginalFileName,
      fallbackDishName: targetImageDishName,
      shouldOverwriteText: !targetText.trim() || targetTextSource !== "manual",
    });
  }

  function commitPlanResult(nextResult) {
    planSequenceRef.current += 1;
    const historyEntry = {
      ...nextResult,
      sessionPlan: {
        id: `plan-${planSequenceRef.current}-${Date.now()}`,
        sequence: planSequenceRef.current,
        createdAt: new Date().toISOString(),
      },
    };
    setResult(historyEntry);
    setPlanHistory((current) => [...current, historyEntry].slice(-3));
  }

  async function createPlan(options = {}) {
    const alternative = options?.alternative === true;
    const inventory = confirmedInventory;
    const baseUserContext = buildUserContext({ alternative });
    saveConfirmedInventorySnapshot(inventory);

    if (intent === "target") {
      if (!targetText.trim() && !targetImage) {
        showToast("输入想吃的菜名，或上传刷到的菜图");
        return;
      }
      const targetRequest = buildTargetDishRequest();
      if (!targetRequest.text) {
        setLoading("");
        showToast(targetImage ? "请先确认或修改识别出的菜名" : "请输入具体菜名，例如“番茄牛腩”");
        return;
      }

      setLoading("正在看家里够不够做");
      const { eatFirst, organization, userContext } = await prepareFridgeRescueContext(inventory, baseUserContext);
      let plan;
      let generation;
      const planningStartedAt = Date.now();
      try {
        const data = await postJson("/api/plan-target-dish", {
          inventory,
          userContext,
          targetDish: targetRequest.targetDish,
        }, { timeoutMs: 60000 });
        plan = normalizeTargetPlan(data.targetPlan, {
          text: targetRequest.text,
          imageAnalysis: targetRequest.imageAnalysis,
          inventory,
        });
        generation = modelGeneration(data, planningStartedAt);
      } catch (error) {
        plan = createTargetFallbackPlan({ text: targetRequest.text, imageAnalysis: targetRequest.imageAnalysis, inventory, mealSlot, availableTime });
        generation = fallbackGeneration(error, planningStartedAt);
      } finally {
        commitPlanResult({ type: "target", plan, eatFirst, organization, generation });
        setLoading("");
        setStage("result");
      }
      return;
    }

    setLoading("正在生成最适合这一餐的做法");
    const { eatFirst, organization, userContext } = await prepareFridgeRescueContext(inventory, baseUserContext);
    let nextResult;
    const planningStartedAt = Date.now();
    try {
      const data = await postJson("/api/plan-dinner", { inventory, userContext });
      nextResult = {
        type: "dinner",
        plan: normalizePlan(data.plan),
        eatFirst,
        organization,
        generation: modelGeneration(data, planningStartedAt),
      };
    } catch (error) {
      nextResult = {
        type: "dinner",
        plan: normalizePlan(modeSample(modeId).plan || fallbackUploadPlan),
        eatFirst,
        organization,
        generation: fallbackGeneration(error, planningStartedAt),
      };
    } finally {
      commitPlanResult(nextResult);
      setLoading("");
      setStage("result");
    }
  }

  async function replanAfterShopping(items) {
    const acceptedItems = namesOf(items.map((item) => item?.item || item), 8);
    if (!acceptedItems.length || result?.type !== "target") return;

    const baseInventory = confirmedInventory.length ? confirmedInventory : normalizeVision(modeSample(modeId).vision).items;
    const existingNames = new Set(namesOf(baseInventory, 32));
    const simulatedInventory = [
      ...baseInventory,
      ...acceptedItems
        .filter((item) => !existingNames.has(item))
        .map((name) => ({
          name,
          category: "模拟补购",
          quantityEstimate: "待实际下单确认",
          confidence: 1,
          state: "用户选择补买",
          notes: "仅用于预览补购后的规划",
        })),
    ];
    const targetRequest = buildTargetDishRequest({
      mode: "simulate_after_purchase",
      acceptedItems,
    });
    if (!targetRequest.text) return;

    setLoading(`正在按补齐的 ${acceptedItems.length} 样材料重新规划`);
    let plan;
    let generation;
    const planningStartedAt = Date.now();
    try {
      const data = await postJson("/api/plan-target-dish", {
        inventory: simulatedInventory,
        userContext: buildUserContext(),
        targetDish: targetRequest.targetDish,
      }, { timeoutMs: 60000 });
      plan = normalizeTargetPlan(data.targetPlan, {
        text: targetRequest.text,
        imageAnalysis: targetRequest.imageAnalysis,
        inventory: simulatedInventory,
      });
      generation = modelGeneration(data, planningStartedAt);
    } catch (error) {
      plan = createTargetFallbackPlan({
        text: targetRequest.text,
        imageAnalysis: targetRequest.imageAnalysis,
        inventory: simulatedInventory,
        mealSlot,
        availableTime,
      });
      generation = fallbackGeneration(error, planningStartedAt);
    } finally {
      commitPlanResult({
        type: "target",
        plan,
        eatFirst: result?.eatFirst || null,
        organization: result?.organization || null,
        shoppingPreview: { acceptedItems, simulated: true },
        generation,
      });
      setLoading("");
      setStage("result");
    }
  }

  function startJourney(nextEntryMode) {
    setEntryMode(nextEntryMode);
    setStage(nextEntryMode === "feed" ? "feed-target" : "fridge-upload");
    setVision(null);
    setConfirmedNames([]);
    setRescueExpanded(false);
    setItemUrgencies({});
    setItemStorageConfirmations({});
    setDismissedUncertaintyKeys([]);
    setReshootStatus("");
    setIntent(nextEntryMode === "feed" ? "target" : "recommend");
    setFridgeImage("");
    setFridgeFileName("");
    setTargetImage("");
    setTargetImageFileName("");
    setTargetOriginalImage("");
    setTargetOriginalFileName("");
    setTargetFocusOpen(false);
    setTargetImageDishName("");
    setTargetImageAnalysis(null);
    setTargetImageStatus("");
    setTargetText("");
    setTargetTextSource("");
    setResult(null);
    setPlanHistory([]);
    planSequenceRef.current = 0;
    setSessionFeedbackType("");
    setLoading("");
  }

  function continueFromFeedTarget() {
    if (!targetText.trim() && !targetImage) {
      showToast("上传菜图，或说出想吃的菜");
      return;
    }
    if (targetImage && !targetText.trim()) {
      showToast("先确认识别出的菜名");
      return;
    }
    setStage("fridge-upload");
  }

  function backFromFridge() {
    setStage(entryMode === "feed" ? "feed-target" : "entry");
  }

  function resetAll() {
    setStage("entry");
    setEntryMode(null);
    setVision(null);
    setConfirmedNames([]);
    setRescueExpanded(false);
    setItemUrgencies({});
    setItemStorageConfirmations({});
    setIntent("recommend");
    setTargetText("");
    setTargetTextSource("");
    setTargetImage("");
    setTargetImageFileName("");
    setTargetOriginalImage("");
    setTargetOriginalFileName("");
    setTargetFocusOpen(false);
    setTargetImageDishName("");
    setTargetImageAnalysis(null);
    setTargetImageStatus("");
    setResult(null);
    setPlanHistory([]);
    planSequenceRef.current = 0;
    setSessionFeedbackType("");
    setLoading("");
  }

  function replanFromInventory() {
    setLoading("");
    setStage("inventory");
  }

  function openSavedPlan(savedPlan = result) {
    if (!savedPlan) return;
    setResult(savedPlan);
    setStage("result");
  }

  async function handleResultFeedback(option, mealName) {
    if (feedbackSaving) return;
    setFeedbackSaving(true);
    try {
      await postJson("/api/users/xiaolin/feedback", {
        type: option.type,
        source: "showcase-result",
        mealName,
      }, { timeoutMs: 5000 });
    } catch {
      // The immediate session constraint still works when local memory is unavailable.
    } finally {
      setFeedbackSaving(false);
    }

    if (!option.replan) {
      showToast("已记下：这版正合适");
      return;
    }

    setSessionFeedbackType(option.type);
    setStage("inventory");
    showToast(`已记下“${option.label}”，下一版会按这个调整`);
  }

  const journeyProgress = entryMode === "feed"
    ? {
        "feed-target": "Feed 路线 · 1/3",
        "fridge-upload": "Feed 路线 · 2/3",
        inventory: "Feed 路线 · 3/3",
        result: "今晚方案",
      }[stage]
    : {
        "fridge-upload": "冰箱路线 · 1/2",
        inventory: "冰箱路线 · 2/2",
        result: "今晚方案",
      }[stage];

  const currentVision = vision || normalizeVision(modeSample(modeId).vision);
  const visibleIngredients = currentVision.items.slice(0, 8);
  const reshootTarget = (vision?.uncertainItems || []).find((item) => !dismissedUncertaintyKeys.includes(uncertaintyKey(item))) || null;

  return (
    <div className="showcase-shell">
      <header className="app-topbar">
        <button className="brand-home" type="button" onClick={resetAll} aria-label="返回场景选择">
          <span className="brand-dot" />
          <strong>今晚开饭</strong>
        </button>
        <span className="topbar-note">{journeyProgress || "视觉搜索"}</span>
      </header>

      <main className="app-main">
        {stage === "entry" && (
          <section className="screen entry-screen" aria-label="选择开始场景">
            <div className="entry-copy">
              <p className="eyebrow">抖音视觉晚餐助手</p>
              <h1>从眼前这一口，决定今晚这一餐</h1>
              <p className="lead">可以从刷到的菜开始，也可以直接打开冰箱。最后只回答一个问题：现在最值得做什么。</p>
            </div>

            <div className="journey-grid">
              <button className="journey-card feed-card" type="button" data-testid="entry-feed" onClick={() => startJourney("feed")}>
                <img src="/demo-assets/菜/黄焖鸡-示例.png" alt="短视频中刷到的一道黄焖鸡" />
                <span className="journey-shade" aria-hidden="true" />
                <span className="journey-content">
                  <small>来自抖音 Feed</small>
                  <strong>刷到想吃的</strong>
                  <span>先看菜，再拍冰箱判断今晚能不能做</span>
                  <b>从这道菜开始</b>
                </span>
              </button>

              <button className="journey-card fridge-card" type="button" data-testid="entry-fridge" onClick={() => startJourney("fridge")}>
                <img src="/demo-assets/fridge-images/f63de1c0794c76a412b9f06f0d919044.png" alt="打开的家用冰箱" />
                <span className="journey-shade" aria-hidden="true" />
                <span className="journey-content">
                  <small>从相机开始</small>
                  <strong>打开冰箱没想法</strong>
                  <span>先确认现有食材，再决定吃什么</span>
                  <b>看看家里有什么</b>
                </span>
              </button>
            </div>

          </section>
        )}

        {stage === "feed-target" && (
          <section className="screen target-first-screen" aria-label="表达想吃的菜">
            <p className="eyebrow">先看刷到的内容</p>
            <h1>刚刚让你停下来的，是哪一道菜？</h1>
            <p className="lead">放入暂停帧、截图或菜图，也可以直接说出菜名和今晚的要求。</p>

            <input ref={targetInputRef} type="file" accept="image/*" onChange={handleTargetFile} hidden />
            <input ref={targetCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleTargetFile} hidden />
            <div className={`target-capture ${targetImage ? "has-image" : ""}`} aria-label="目标菜图片预览区">
              {targetImage ? (
                <img src={targetImage} alt="目标菜图片预览" />
              ) : (
                <span>
                  <strong>菜图预览区</strong>
                  <small>还未添加画面</small>
                </span>
              )}
            </div>

            <div className="target-image-actions">
              <button className="camera-upload" type="button" onClick={() => targetCameraInputRef.current?.click()}>
                直接拍菜图
              </button>
              <button className="secondary-upload" type="button" onClick={() => targetInputRef.current?.click()}>
                {targetImage ? "选择其他图片" : "选择已有图片"}
              </button>
              <button className="sample-action compact" type="button" onClick={loadDemoTargetDish} disabled={Boolean(loading)}>
                用示例黄焖鸡
              </button>
            </div>

            {targetImage && (
              <div className="image-focus-toolbar">
                <button type="button" onClick={() => setTargetFocusOpen((current) => !current)} disabled={Boolean(loading)}>
                  {targetFocusOpen ? "收起框选" : "框选画面重点"}
                </button>
                {targetOriginalImage && targetImage !== targetOriginalImage && (
                  <button type="button" onClick={restoreTargetImage} disabled={Boolean(loading)}>恢复整张图</button>
                )}
              </div>
            )}

            {targetFocusOpen && targetImage && (
              <ImageFocusSelector
                imageDataUrl={targetImage}
                onApply={applyTargetFocus}
                onCancel={() => setTargetFocusOpen(false)}
              />
            )}

            <div className="target-panel">
              <label className="field-label" htmlFor="feed-target-text">确认菜名，补充你的要求</label>
              <textarea
                id="feed-target-text"
                value={targetText}
                onChange={(event) => {
                  setTargetText(event.target.value);
                  setTargetTextSource("manual");
                }}
                placeholder="例如：今晚想吃黄焖鸡，但只有 25 分钟"
                rows={3}
              />
              <SpeechInput
                disabled={Boolean(loading)}
                onTranscript={(transcript) => {
                  setTargetText((current) => mergeSpeechTranscript(current, transcript));
                  setTargetTextSource("speech");
                }}
              />
              {targetImageStatus && (
                <div className="target-status">
                  <strong>菜名确认</strong>
                  <span>{targetImageStatus}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {stage === "fridge-upload" && (
          <section className="screen screen-upload" aria-label="添加冰箱照片">
            <p className="eyebrow">{entryMode === "feed" ? "再看现实库存" : "先看手上的食材"}</p>
            <h1>{entryMode === "feed" ? "家里够不够做这道菜？" : "先看冰箱，再决定这顿饭"}</h1>
            <p className="lead">
              {entryMode === "feed"
                ? "拍下冰箱并确认今晚的时间，我会把想吃的和家里现有的放在一起判断。"
                : "拍下冰箱，确认这一餐和可支配时间，再决定由 AI 推荐还是照着某道菜做。"}
            </p>

            {entryMode === "feed" && (
              <button className="target-context" type="button" onClick={() => setStage("feed-target")}>
                {targetImage && <img src={targetImage} alt="已选择的目标菜" />}
                <span>
                  <small>今晚想吃</small>
                  <strong>{targetText || targetImageDishName || "已选择的菜"}</strong>
                </span>
                <b>修改</b>
              </button>
            )}

            <div className="mode-grid" aria-label="状态选择">
              {modeCards.map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-card ${modeId === mode.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setMode(mode.id)}
                >
                  <strong>{mode.title}</strong>
                  <span>{mode.subtitle}</span>
                </button>
              ))}
            </div>

            <div className="confirm-panel">
              <div>
                <div className="field-label">餐次</div>
                <div className="segmented">
                  {mealSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={mealSlot === slot.id ? "active" : ""}
                      onClick={() => setMealSlot(slot.id)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{mealSlotHint(mealSlot)}</p>
              </div>
              <div>
                <div className="field-label">你愿意花多久</div>
                <div className="segmented">
                  {["15 分钟", "25 分钟", "40 分钟"].map((time) => (
                    <button
                      key={time}
                      type="button"
                      className={availableTime === time ? "active" : ""}
                      onClick={() => setAvailableTime(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {confirmedInventorySnapshot?.items?.length > 0 && (
              <section className="inventory-snapshot" aria-label="上次确认的冰箱库存">
                <div>
                  <strong>继续用上次确认的库存</strong>
                  <small>
                    {inventorySnapshotTime(confirmedInventorySnapshot.confirmedAt)} 确认 · {confirmedInventorySnapshot.items.length} 种
                  </small>
                  <span>{namesOf(confirmedInventorySnapshot.items, 5).join("、")}</span>
                </div>
                <div className="inventory-snapshot-actions">
                  <button className="secondary-action" type="button" onClick={useConfirmedInventorySnapshot}>使用这份库存</button>
                  <button className="text-link" type="button" onClick={clearConfirmedInventorySnapshot}>清除</button>
                </div>
                <p>这是本设备上次人工确认的记录，不代表食材现在仍然存在。</p>
              </section>
            )}

            <input ref={fridgeInputRef} type="file" accept="image/*" onChange={handleFridgeFile} hidden />
            <input ref={fridgeCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFridgeFile} hidden />
            <div className={`upload-tile ${fridgeImage ? "has-image" : ""}`} aria-label="冰箱照片预览区">
              {fridgeImage ? (
                <img src={fridgeImage} alt="冰箱照片预览" />
              ) : (
                <span>
                  <strong>冰箱照片预览区</strong>
                  <small>还未添加照片</small>
                </span>
              )}
            </div>
            <div className="fridge-image-actions">
              <button className="camera-upload" type="button" onClick={() => fridgeCameraInputRef.current?.click()}>直接拍冰箱</button>
              <button className="secondary-upload" type="button" onClick={() => fridgeInputRef.current?.click()}>
                {fridgeImage ? "选择其他图片" : "选择已有图片"}
              </button>
              <button className="sample-action compact" type="button" onClick={loadDemoFridge} disabled={Boolean(loading)}>用示例体验</button>
            </div>
          </section>
        )}

        {stage === "inventory" && (
          <section className="screen inventory-screen" aria-label="确认食材并选择规划方式">
            <p className="eyebrow">确认视觉识别结果</p>
            <h1>{entryMode === "feed" ? "最后确认，家里到底有什么" : "确认食材，再决定吃什么"}</h1>
            <p className="lead">点掉识别不准或现在不能用的食材，规划只会使用你确认留下的内容。</p>

            <div className="ingredient-strip" aria-label="可用食材确认">
              {visibleIngredients.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={confirmedNames.includes(item.name) ? "ingredient active" : "ingredient"}
                  onClick={() => toggleIngredient(item.name)}
                >
                  {ingredientIconUrl(item.name) && (
                    <img
                      src={ingredientIconUrl(item.name)}
                      alt=""
                      aria-hidden="true"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>

            {reshootTarget && (
              <section className="uncertainty-reshoot" aria-label="补拍没看清的冰箱区域">
                <div>
                  <span>有一处没看清</span>
                  <strong>{buildReshootInstruction(reshootTarget)}</strong>
                  <small>补拍结果会并入当前库存，不会让你从头再来。</small>
                </div>
                <input ref={reshootInputRef} type="file" accept="image/*" onChange={handleFridgeReshootFile} hidden />
                <input ref={reshootCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFridgeReshootFile} hidden />
                <div className="uncertainty-reshoot-actions">
                  <button className="camera-upload" type="button" onClick={() => reshootCameraInputRef.current?.click()} disabled={Boolean(loading)}>补拍这个区域</button>
                  <button className="secondary-upload" type="button" onClick={() => reshootInputRef.current?.click()} disabled={Boolean(loading)}>选择补拍图片</button>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setDismissedUncertaintyKeys((current) => [...new Set([...current, uncertaintyKey(reshootTarget)])])}
                  >
                    暂时跳过
                  </button>
                </div>
                {reshootStatus && <p>{reshootStatus}</p>}
              </section>
            )}

            {!reshootTarget && reshootStatus && <p className="reshoot-success">{reshootStatus}</p>}

            {confirmedInventory.length > 0 && (
              <section className="eat-first-tool" aria-label="确认想优先处理的食材">
                <button
                  className="eat-first-toggle"
                  type="button"
                  aria-expanded={rescueExpanded}
                  onClick={() => setRescueExpanded((current) => !current)}
                >
                  <span>
                    <strong>有食材想优先处理？</strong>
                    <small>按你确认的开封、标签或包装状态安排</small>
                  </span>
                  <b>{rescueExpanded ? "收起" : "确认状态"}</b>
                </button>
                {rescueExpanded && (
                  <div className="eat-first-status-list">
                    {confirmedInventory.slice(0, 8).map((item) => {
                      const storagePrompt = storageConfirmationPrompt(item, confirmedInventory);
                      return (
                        <label key={item.name}>
                          <span>{item.name}</span>
                          <div className="eat-first-status-controls">
                            <select
                              aria-label={`${item.name}优先处理状态`}
                              value={itemUrgencies[item.name] || "no_reminder"}
                              onChange={(event) => setIngredientStatus(item.name, event.target.value)}
                            >
                              {ingredientStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            {storagePrompt && (
                              <select
                                aria-label={`${item.name}存放条件`}
                                value={itemStorageConfirmations[item.name] || "not_confirmed"}
                                onChange={(event) => setStorageConfirmation(item.name, event.target.value)}
                              >
                                <option value="not_confirmed">{storagePrompt.placeholder}</option>
                                <option value={storagePrompt.value}>{storagePrompt.label}</option>
                              </select>
                            )}
                          </div>
                        </label>
                      );
                    })}
                    <p>只使用你确认的信息；跨分区移动需要满足包装条件，食用前仍需检查标签、存放和实际状态。</p>
                  </div>
                )}
              </section>
            )}

            {entryMode === "feed" ? (
              <button className="target-context inventory-target" type="button" onClick={() => setStage("feed-target")}>
                {targetImage && <img src={targetImage} alt="已选择的目标菜" />}
                <span>
                  <small>正在判断</small>
                  <strong>{targetText || targetImageDishName || "目标菜"}</strong>
                </span>
                <b>修改</b>
              </button>
            ) : (
              <div className="choice-grid">
                <button
                  type="button"
                  className={`choice ${intent === "recommend" ? "active" : ""}`}
                  onClick={() => setIntent("recommend")}
                >
                  <strong>帮我决定</strong>
                  <span>根据冰箱和时间，直接给一顿最稳的</span>
                </button>
                <button
                  type="button"
                  className={`choice ${intent === "target" ? "active" : ""}`}
                  onClick={() => setIntent("target")}
                >
                  <strong>我有想吃的</strong>
                  <span>指定一道菜，看看家里够不够做</span>
                </button>
              </div>
            )}

            {entryMode === "fridge" && intent === "target" && (
              <div className="target-panel">
                <label className="field-label" htmlFor="fridge-target-text">想吃的菜</label>
                <textarea
                  id="fridge-target-text"
                  value={targetText}
                  onChange={(event) => {
                    setTargetText(event.target.value);
                    setTargetTextSource("manual");
                  }}
                  placeholder="例如：我今晚想吃番茄牛腩，但只有 25 分钟"
                  rows={3}
                />
                <SpeechInput
                  disabled={Boolean(loading)}
                  onTranscript={(transcript) => {
                    setTargetText((current) => mergeSpeechTranscript(current, transcript));
                    setTargetTextSource("speech");
                  }}
                />
                <input ref={targetInputRef} type="file" accept="image/*" onChange={handleTargetFile} hidden />
                <input ref={targetCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleTargetFile} hidden />
                <div className="target-image-actions">
                  <button className="camera-upload" type="button" onClick={() => targetCameraInputRef.current?.click()}>
                    直接拍菜图
                  </button>
                  <button className="secondary-upload" type="button" onClick={() => targetInputRef.current?.click()}>
                    {targetImage ? "选择其他图片" : "选择已有图片"}
                  </button>
                  <button className="sample-action compact" type="button" onClick={loadDemoTargetDish} disabled={Boolean(loading)}>
                    用示例菜图
                  </button>
                </div>
                {targetImage && (
                  <div className="image-focus-toolbar">
                    <button type="button" onClick={() => setTargetFocusOpen((current) => !current)} disabled={Boolean(loading)}>
                      {targetFocusOpen ? "收起框选" : "框选画面重点"}
                    </button>
                    {targetOriginalImage && targetImage !== targetOriginalImage && (
                      <button type="button" onClick={restoreTargetImage} disabled={Boolean(loading)}>恢复整张图</button>
                    )}
                  </div>
                )}
                {targetFocusOpen && targetImage && (
                  <ImageFocusSelector
                    imageDataUrl={targetImage}
                    onApply={applyTargetFocus}
                    onCancel={() => setTargetFocusOpen(false)}
                  />
                )}
                {targetImageStatus && (
                  <div className="target-status">
                    <strong>菜名确认</strong>
                    <span>{targetImageStatus}</span>
                  </div>
                )}
                {targetImage && (
                  <button
                    className="ghost-action"
                    type="button"
                    onClick={() => analyzeTargetImage({ shouldOverwriteText: true })}
                    disabled={Boolean(loading)}
                  >
                    重新识别并填入菜名
                  </button>
                )}
                {targetImage && <img className="target-preview" src={targetImage} alt="目标菜图片预览" />}
              </div>
            )}
          </section>
        )}

        {stage === "result" && result && (
          <section className="screen result-screen" aria-label="推荐方案">
            <ResultView
              result={result}
              modeId={modeId}
              mealSlot={mealSlot}
              onReplan={replanFromInventory}
              onRestart={resetAll}
              onAction={showToast}
              onShopAndReplan={replanAfterShopping}
              onGenerateAlternative={() => createPlan({ alternative: true })}
              planHistory={planHistory}
              onSelectPlan={openSavedPlan}
              onFeedback={handleResultFeedback}
              feedbackSaving={feedbackSaving}
            />
          </section>
        )}
      </main>

      {stage !== "entry" && stage !== "result" && (
        <footer className="bottom-action">
          {stage === "feed-target" && (
            <div className="footer-row">
              <button className="ghost-action" type="button" onClick={() => setStage("entry")}>返回</button>
              <button className="primary-action" type="button" onClick={continueFromFeedTarget} disabled={Boolean(loading)}>
                下一步，看冰箱
              </button>
            </div>
          )}
          {stage === "fridge-upload" && (
            <div className="footer-row">
              <button className="ghost-action" type="button" onClick={backFromFridge}>上一步</button>
              <button className="primary-action" type="button" onClick={analyzeFridge} disabled={!fridgeImage || Boolean(loading)}>
                {loading || "识别冰箱"}
              </button>
            </div>
          )}
          {stage === "inventory" && (
          <div className="footer-row">
            {result ? (
              <button className="secondary-action" type="button" onClick={() => openSavedPlan()}>查看当前方案</button>
            ) : (
              <button className="ghost-action" type="button" onClick={() => setStage("fridge-upload")}>上一步</button>
            )}
            <button className="primary-action" type="button" onClick={() => createPlan()} disabled={Boolean(loading)}>
              {loading || (result ? "生成新方案" : intent === "target" ? "看看家里够不够做" : "生成这一餐")}
            </button>
          </div>
          )}
        </footer>
      )}

      {loading && (
        <div className="loading-mask">
          <span className="spinner" />
          <p>{loading}</p>
          <span className="loading-detail">已用时 {loadingElapsed}s · {loadingPhase(loading, loadingElapsed)}</span>
        </div>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

function ResultView({ result, modeId, mealSlot, onReplan, onRestart, onAction, onShopAndReplan, onGenerateAlternative, planHistory, onSelectPlan, onFeedback, feedbackSaving }) {
  if (result.type === "target") {
    const plan = result.plan;
    const available = namesOf(plan.inventoryMatch.availableItems, 6);
    const missing = namesOf(plan.inventoryMatch.missingCritical, 6);
    const mustBuy = normalizeShoppingItems(plan.shoppingPlan?.mustBuy, missing);
    const confirmAtHome = namesOf(plan.shoppingPlan?.confirmAtHome, 6);
    const optionalUpgrades = namesOf(plan.shoppingPlan?.optionalUpgrades, 6);
    const coverageStatus = plan.inventoryMatch?.coverageStatus || (missing.length ? "missing" : "unresolved");
    const needsConfirmation = namesOf(plan.inventoryMatch?.needsConfirmationItems, 6);
    const missingLabel = coverageStatus === "enough"
      ? "主要材料够了"
      : coverageStatus === "unresolved"
        ? "主料还没核对清楚"
        : "";
    const shoppingHeading = coverageStatus === "enough"
      ? "主要材料已经够了"
      : coverageStatus === "unresolved"
        ? "先确认主料，再决定补买"
        : `做完整版还差 ${mustBuy.length} 样`;

    return (
      <>
        <p className="eyebrow">今晚的可执行方案</p>
        <h1>{plan.targetDish.name}</h1>
        <p className="lead">{userText(plan.verdict.summary)}</p>
        <PlanGenerationNotice generation={result.generation} />

        <section className="result-hero">
          <span>{formatMealSlot(mealSlot)}路线</span>
          <strong>{userText(plan.executionPlan.recommendedVersion)}</strong>
        </section>

        <PlanHistory plans={planHistory} currentPlan={result} onSelect={onSelectPlan} />

        {result.shoppingPreview?.acceptedItems?.length > 0 && (
          <section className="shopping-preview-note">
            <strong>补齐后方案 · 模拟</strong>
            <span>本轮已把 {result.shoppingPreview.acceptedItems.join("、")} 作为可用材料重新交给 Planner；没有发生真实下单。</span>
          </section>
        )}

        {result.eatFirst && <EatFirstCard eatFirst={result.eatFirst} />}

        {result.organization && <FridgeOrganizationCard organization={result.organization} />}

        <section className="compact-section">
          <h2>今晚怎么做</h2>
          <ol className="clean-steps">
            {plan.executionPlan.steps.slice(0, 4).map((step, index) => (
              <li key={index}>{userText(step)}</li>
            ))}
          </ol>
        </section>

        <section className="two-column">
          <div>
            <h2>{coverageStatus === "unresolved" ? "已核对" : "已有"}</h2>
            <div className="pill-list">
              {available.length ? available.map((item) => <span key={item}>{item}</span>) : <span>暂无匹配主料</span>}
            </div>
          </div>
          <div>
            <h2>{coverageStatus === "unresolved" ? "待确认" : "还差"}</h2>
            <div className="pill-list warn">
              {missing.length ? missing.map((item) => <span key={item}>{item}</span>) : <span>{missingLabel}</span>}
            </div>
          </div>
        </section>

        {coverageStatus === "unresolved" && (
          <section className="quiet-note">
            <strong>为什么还不能说材料够了</strong>
            <p>
              当前只确认了菜名，还没有足够证据把冰箱里的物品和这道菜的主要材料一一对应。
              {needsConfirmation.length ? ` 可以优先确认：${needsConfirmation.join("、")}。` : " 请补充主料名称，或补拍看不清的包装。"}
            </p>
          </section>
        )}

        {plan.executionPlan.difficultyWarnings?.length > 0 && (
          <section className="quiet-note">
            <strong>难点提醒</strong>
            <p>{userText(plan.executionPlan.difficultyWarnings[0])}</p>
          </section>
        )}

        <DishRescueCard
          mealName={plan.targetDish.name}
          mealSummary={plan.verdict.summary}
          steps={plan.executionPlan.steps}
        />

        {(mustBuy.length > 0 || confirmAtHome.length > 0 || optionalUpgrades.length > 0) && (
          <section className="compact-section shopping-plan-card">
            <div className="shopping-plan-heading">
              <h2>{shoppingHeading}</h2>
              <span>{coverageStatus === "unresolved" ? "未核清前不生成误导性的购物结论" : "按整道菜核对，不只推荐一件商品"}</span>
            </div>
            {mustBuy.map((item) => (
              <div className="shopping-line" key={item.item}>
                <strong>{item.item}</strong>
                <span>{item.reason}</span>
              </div>
            ))}
            {confirmAtHome.length > 0 && (
              <div className="shopping-plan-group">
                <strong>家里可能有，做之前确认</strong>
                <div className="pill-list">{confirmAtHome.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            )}
            {optionalUpgrades.length > 0 && (
              <div className="shopping-plan-group optional">
                <strong>可选升级，不买也能做</strong>
                <div className="pill-list">{optionalUpgrades.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            )}
            {mustBuy.length > 0 && (
              <>
                <button className="ecosystem-action" type="button" onClick={() => onShopAndReplan(mustBuy)}>
                  加入模拟购物车，并按补齐后重新规划
                </button>
                <small className="shopping-plan-boundary">这里只预览补购如何改变方案，不会真实下单或扣款。</small>
              </>
            )}
          </section>
        )}

        <FeedbackPanel mealName={plan.targetDish.name} onFeedback={onFeedback} saving={feedbackSaving} />

        <LifeLogCard
          mealName={plan.targetDish.name}
          mealSummary={plan.verdict.summary}
          onAction={onAction}
        />

        <ResultActions onReplan={onReplan} onGenerateAlternative={onGenerateAlternative} onRestart={onRestart} />
      </>
    );
  }

  const plan = result.plan;
  const needed = namesOf(plan.baseMeal.requiredItems, 6);
  const shouldShowFallback = modeId === "tired" && plan.fallback?.type !== "delivery" && plan.fallback?.suggestion;

  return (
    <>
      <p className="eyebrow">今晚的可执行方案</p>
      <h1>{plan.baseMeal.name}</h1>
      <p className="lead">{plan.summary || plan.baseMeal.why}</p>
      <PlanGenerationNotice generation={result.generation} />

      <section className="result-hero">
        <span>{plan.baseMeal.timeCost || "约 25 分钟"} · {plan.baseMeal.difficulty || "新手可做"}</span>
        <strong>{plan.baseMeal.why}</strong>
      </section>

      <PlanHistory plans={planHistory} currentPlan={result} onSelect={onSelectPlan} />

      {result.eatFirst && <EatFirstCard eatFirst={result.eatFirst} />}

      {result.organization && <FridgeOrganizationCard organization={result.organization} />}

      <section className="compact-section">
        <h2>现在就做</h2>
        <ol className="clean-steps">
          {plan.baseMeal.steps.slice(0, 4).map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="compact-section">
        <h2>会用到</h2>
        <div className="pill-list">{needed.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      {plan.shoppingUpgrade?.neededItems?.filter((item) => item !== "无").length > 0 && (
        <section className="quiet-note">
          <strong>可选补买</strong>
          <p>{plan.shoppingUpgrade.neededItems.filter((item) => item !== "无").join("、")}。{plan.shoppingUpgrade.reason}</p>
          <button className="ecosystem-action secondary" type="button" onClick={() => onAction("已加入模拟购物车")}>
            放进模拟购物车，去抖音商城看看
          </button>
        </section>
      )}

      {shouldShowFallback && (
        <section className="quiet-note">
          <strong>低负担备选</strong>
          <p>{plan.fallback.suggestion}</p>
        </section>
      )}

      <DishRescueCard
        mealName={plan.baseMeal.name}
        mealSummary={plan.summary || plan.baseMeal.why}
        steps={plan.baseMeal.steps}
      />

      <FeedbackPanel mealName={plan.baseMeal.name} onFeedback={onFeedback} saving={feedbackSaving} />

      <LifeLogCard
        mealName={plan.baseMeal.name}
        mealSummary={plan.summary || plan.baseMeal.why}
        onAction={onAction}
      />

      <ResultActions onReplan={onReplan} onGenerateAlternative={onGenerateAlternative} onRestart={onRestart} />
    </>
  );
}

function PlanGenerationNotice({ generation }) {
  if (!generation?.source) return null;
  const elapsedSeconds = Math.max(1, Math.round((generation.elapsedMs || 0) / 1000));
  const isTimeoutFallback = generation.source === "timeout-rules";
  const isErrorFallback = generation.source === "error-rules";
  const isCacheFallback = generation.source.includes("cache");
  const isFallback = isTimeoutFallback || isErrorFallback || isCacheFallback;
  const title = isTimeoutFallback
    ? "等待较久，已切换稳定方案"
    : isErrorFallback
      ? "服务波动，已切换稳定方案"
      : isCacheFallback
        ? "网络较慢，已载入固定演示方案"
        : "已根据本次库存生成";
  const diagnosticId = isFallback && generation.requestId ? ` 诊断编号 ${generation.requestId.slice(0, 8)}。` : "";
  const detail = isTimeoutFallback || isErrorFallback
    ? `你仍可继续操作，网络恢复后可以再生成一次。${diagnosticId}`
    : isCacheFallback
      ? `当前结果来自已审查的演示兜底，不会冒充实时识别。${diagnosticId}`
      : `本次生成耗时约 ${elapsedSeconds} 秒。`;
  return (
    <div className={`plan-generation-notice ${isFallback ? "fallback" : "model"}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function EatFirstCard({ eatFirst }) {
  const tonight = namesOf(eatFirst.tonightPriority || [], 5);
  const soon = namesOf(eatFirst.soonPriority || [], 5);
  const needs = namesOf(eatFirst.needsConfirmation || [], 5);
  if (!tonight.length && !soon.length && !needs.length) return null;

  return (
    <section className="eat-first-card" aria-label="按用户确认状态生成的先吃清单">
      <div className="eat-first-card-heading">
        <span>按你确认的信息</span>
        <small>冰箱救援</small>
      </div>
      <h2>{eatFirst.summary}</h2>
      <div className="eat-first-groups">
        {tonight.length > 0 && (
          <div className="tonight">
            <strong>这一餐优先</strong>
            <span>{tonight.join("、")}</span>
          </div>
        )}
        {soon.length > 0 && (
          <div>
            <strong>接下来两餐</strong>
            <span>{soon.join("、")}</span>
          </div>
        )}
        {needs.length > 0 && (
          <div className="confirm">
            <strong>先确认状态</strong>
            <span>{needs.join("、")}</span>
          </div>
        )}
      </div>
      <p>先吃顺序不代表食材未过期或可以安全食用。</p>
    </section>
  );
}

function FridgeOrganizationCard({ organization }) {
  const [layoutMode, setLayoutMode] = useState("before");
  const suggestions = Array.isArray(organization?.suggestions) ? organization.suggestions.slice(0, 3) : [];
  if (!suggestions.length) return null;
  const layoutPreview = organization?.layoutPreview;
  const affectedZones = new Set(suggestions.flatMap((item) => [item.currentZone, item.suggestedZone]).filter(Boolean));
  const currentLayout = Array.isArray(layoutPreview?.[layoutMode])
    ? layoutPreview[layoutMode].filter((group) => affectedZones.has(group.zone))
    : [];

  return (
    <section className="fridge-organization-card" aria-label="粗粒度冰箱整理建议">
      <div className="fridge-organization-heading">
        <span>粗分区整理</span>
        <small>最多 3 条</small>
      </div>
      <h2>把这顿饭会用到的食材放得更顺手</h2>
      {currentLayout.length > 0 && (
        <div className="fridge-layout-preview">
          <div className="fridge-layout-toolbar">
            <div className="fridge-layout-tabs" role="tablist" aria-label="整理布局预览">
              <button type="button" role="tab" aria-selected={layoutMode === "before"} onClick={() => setLayoutMode("before")}>现在</button>
              <button type="button" role="tab" aria-selected={layoutMode === "after"} onClick={() => setLayoutMode("after")}>建议后</button>
            </div>
            <small>{layoutMode === "after" ? "规则预览，不代表已完成" : "来自视觉粗分区"}</small>
          </div>
          <div className="fridge-layout-zones">
            {currentLayout.map((group) => (
              <div className="fridge-layout-zone" key={group.zone}>
                <strong>{group.zoneLabel}</strong>
                <div>
                  {group.items.slice(0, 6).map((item) => (
                    <span className={item.moved ? "moved" : ""} key={item.name}>
                      {item.name}{item.moved && item.position === "front" ? " · 靠前" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="fridge-organization-list">
        {suggestions.map((item, index) => {
          const targetLabel = item.type === "confirm_first"
            ? "确认后再动"
            : item.type === "same_zone_front"
              ? `${item.suggestedZoneLabel}前侧`
              : item.suggestedZoneLabel;
          return (
            <div className={`fridge-organization-line ${item.type === "confirm_first" ? "confirm" : ""}`} key={`${item.item}-${index}`}>
              <div className="fridge-move-path">
                <strong>{item.item}</strong>
                <span>{item.currentZoneLabel}</span>
                <b aria-hidden="true">→</b>
                <span>{targetLabel}</span>
              </div>
              <p>{item.reason}</p>
              {item.requiresUserConfirmation && <small>{item.prerequisite}</small>}
            </div>
          );
        })}
      </div>
      <p className="fridge-organization-boundary">只识别门架、层架、抽屉等粗分区，不判断过期、新鲜度或是否可以安全食用。</p>
    </section>
  );
}

function FeedbackPanel({ mealName, onFeedback, saving }) {
  return (
    <section className="feedback-panel" aria-label="这版方案是否合适">
      <div>
        <h2>这版合适吗？</h2>
        <p>点一下就会记住；需要调整时，下一版会直接带上这个要求。</p>
      </div>
      <div className="feedback-options">
        {resultFeedbackOptions.map((option) => (
          <button key={option.type} type="button" onClick={() => onFeedback(option, mealName)} disabled={saving}>
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function planHistoryLabel(result) {
  if (result?.type === "target") return result.plan?.targetDish?.name || "目标菜方案";
  return result?.plan?.baseMeal?.name || "晚餐方案";
}

function PlanHistory({ plans = [], currentPlan, onSelect }) {
  if (plans.length < 2) return null;
  return (
    <section className="plan-history" aria-label="本次生成的方案记录">
      <div className="plan-history-heading">
        <strong>本次已保留 {plans.length} 个方案</strong>
        <small>最多保留最近 3 个，可以直接切回</small>
      </div>
      <div className="plan-history-list">
        {plans.map((plan, index) => {
          const active = plan.sessionPlan?.id === currentPlan?.sessionPlan?.id;
          return (
            <button
              className={active ? "active" : ""}
              type="button"
              key={plan.sessionPlan?.id || index}
              onClick={() => onSelect(plan)}
            >
              <span>方案 {index + 1}</span>
              <strong>{planHistoryLabel(plan)}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ResultActions({ onReplan, onGenerateAlternative, onRestart }) {
  return (
    <div className="result-actions">
      <button className="secondary-action" type="button" onClick={onReplan}>调整条件</button>
      <button className="primary-action" type="button" onClick={onGenerateAlternative}>再生成一个方案</button>
      <button className="text-link" type="button" onClick={onRestart}>换一种开始方式</button>
    </div>
  );
}

function DishRescueCard({ mealName, mealSummary, steps = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState("");
  const [symptom, setSymptom] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("1 人");
  const [currentStep, setCurrentStep] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [demoContext, setDemoContext] = useState(null);
  const [rescue, setRescue] = useState(null);
  const [rescueRound, setRescueRound] = useState(1);
  const [followUp, setFollowUp] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cameraInputRef = useRef(null);
  const albumInputRef = useRef(null);
  const selectedCategory = dishRescueCategories.find((item) => item.id === category);

  function resetRescueLoop() {
    setRescue(null);
    setRescueRound(1);
    setFollowUp(null);
    setResolved(false);
    setSource("");
  }

  async function prepareImage(file) {
    if (!file) return false;
    setRescue(null);
    setStatus("正在处理当前画面");
    try {
      setImageDataUrl(await compressImage(file, 1280, 0.84));
      setSourceFileName(file.name || "cooking-progress.jpg");
      setStatus("当前画面已就绪");
      return true;
    } catch (error) {
      setStatus(error.message || "图片读取失败");
      return false;
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!followUp) {
      setDemoContext(null);
      resetRescueLoop();
    }
    await prepareImage(file);
  }

  async function loadDemoSample(sample) {
    setStatus("正在加载演示过程图");
    resetRescueLoop();
    try {
      const file = await fetchDemoFile(sample.path, sample.fileName);
      if (!await prepareImage(file)) return;
      setDemoContext(sample);
      setCategory(sample.category);
      setSymptom(sample.symptom);
      setDescription(sample.description);
      setServings(sample.servings);
      setCurrentStep(sample.currentStep);
      setStatus("演示素材已就绪，可修改描述后开始判断");
    } catch (error) {
      setStatus(error.message || "演示素材加载失败");
    }
  }

  async function submitRescue() {
    if (!category) {
      setStatus("先选择卡在哪一类");
      return;
    }
    if (!symptom) {
      setStatus("再选择最接近的具体情况");
      return;
    }
    if (!imageDataUrl) {
      setStatus("请拍一张锅里或盘里的当前画面");
      return;
    }
    setSubmitting(true);
    setRescue(null);
    setStatus("正在结合画面、你的描述和原步骤判断");
    const contextDishName = demoContext?.dishName || mealName;
    const contextSteps = demoContext?.steps || steps;
    try {
      const data = await postJson("/api/rescue-dish", {
        imageDataUrl,
        sourceFileName,
        category,
        symptom,
        description,
        dishContext: {
          dishName: contextDishName,
          summary: demoContext ? "固定演示过程图，由用户确认问题后请求救援。" : mealSummary,
          servings,
          currentStep,
          steps: contextSteps,
        },
        followUp,
      }, { timeoutMs: 60000 });
      setRescue(normalizeDishRescue(data.dishRescue, contextDishName, category, symptom));
      setRescueRound(followUp?.round || 1);
      if (followUp) setFollowUp(null);
      setSource(data.source || "model");
      if (String(data.source || "").includes("cache")) setStatus("演示网络响应较慢，已加载固定演示结果");
      else if (data.source === "rules-fallback") setStatus("视觉服务暂不可用，已按你的选择给出保守建议");
      else setStatus("先只执行下面第一步，确认后再继续");
    } catch {
      setRescue(fallbackDishRescue(contextDishName, category, symptom));
      setRescueRound(followUp?.round || 1);
      if (followUp) setFollowUp(null);
      setSource("local-fallback");
      setStatus("网络暂不可用，已给出不依赖图片判断的保守建议");
    } finally {
      setSubmitting(false);
    }
  }

  function beginFollowUp(outcome) {
    if (!rescue || rescueRound >= 2) return;
    const previousAction = rescue.actions?.[0] || {};
    setFollowUp({
      round: 2,
      outcome,
      previousHeadline: rescue.headline,
      previousAction: [previousAction.title, previousAction.instruction].filter(Boolean).join("："),
      previousCheck: previousAction.check,
    });
    setRescue(null);
    setResolved(false);
    setImageDataUrl("");
    setSourceFileName("");
    setDescription(outcome === "not_improved" ? "刚才的动作做完后没有明显改善。" : "");
    setStatus("请拍一张执行后的新画面，这是最后一轮复查");
    cameraInputRef.current?.click();
  }

  return (
    <section className="dish-rescue-card" aria-label="做到一半卡住了">
      <div className="dish-rescue-heading">
        <div>
          <h2>做到一半卡住了？</h2>
          <p>拍一下当前状态，再说一句哪里不对，我只给你下一步。</p>
        </div>
        {!expanded && <button type="button" onClick={() => setExpanded(true)}>现在救一下</button>}
      </div>

      {expanded && (
        <div className="dish-rescue-workspace">
          <div className="dish-rescue-demo-row" aria-label="固定演示素材">
            <span>固定演示素材 · AI 生成，不作为真实用户评测</span>
            <div>
              {dishRescueDemoSamples.map((sample) => (
                <button key={sample.id} type="button" onClick={() => loadDemoSample(sample)} disabled={submitting}>
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {followUp && !rescue && (
            <div className="dish-rescue-followup-banner">
              <strong>第 2 轮 · 执行后复查</strong>
              <span>{followUp.outcome === "not_improved" ? "已记录“没有改善”，这次不会重复上一个动作。" : "用新画面核对上一步的观察点。"}</span>
            </div>
          )}

          <div className="dish-rescue-categories" role="group" aria-label="问题类别">
            {dishRescueCategories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.id ? "active" : ""}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setSymptom("");
                  resetRescueLoop();
                }}
              >
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>

          {selectedCategory && (
            <div className="dish-rescue-symptoms" aria-label={`${selectedCategory.label}的具体情况`}>
              {selectedCategory.symptoms.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={symptom === item ? "active" : ""}
                  aria-pressed={symptom === item}
                  onClick={() => {
                    setSymptom(item);
                    resetRescueLoop();
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          <div className="dish-rescue-context">
            <label>
              <span>大概做到哪一步</span>
              <select value={currentStep} onChange={(event) => setCurrentStep(event.target.value)}>
                <option value="">说不清 / 还没确认</option>
                {(demoContext?.steps || steps).slice(0, 6).map((step, index) => <option value={step} key={`${step}-${index}`}>{index + 1}. {step}</option>)}
              </select>
            </label>
            <label>
              <span>这锅大约几人吃</span>
              <select value={servings} onChange={(event) => setServings(event.target.value)}>
                <option>1 人</option>
                <option>2 人</option>
                <option>3-4 人</option>
                <option>说不清</option>
              </select>
            </label>
          </div>

          <label className="dish-rescue-description">
            <span>补充你看到、闻到或尝到的情况</span>
            <textarea
              rows={3}
              maxLength={180}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="例如：刚尝了一口偏咸；锅底开始粘，但上面还没糊"
            />
          </label>
          <SpeechInput
            disabled={submitting}
            onTranscript={(transcript) => setDescription((current) => mergeSpeechTranscript(current, transcript))}
          />

          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
          <input ref={albumInputRef} hidden type="file" accept="image/*" onChange={handleFileChange} />
          <div className="dish-rescue-upload-row">
            <button type="button" onClick={() => cameraInputRef.current?.click()}>{followUp ? "拍复查画面" : "拍当前画面"}</button>
            <button type="button" onClick={() => albumInputRef.current?.click()}>{followUp ? "选复查图" : "从相册选"}</button>
            {imageDataUrl && <img src={imageDataUrl} alt="当前做菜画面预览" />}
          </div>

          <button className="dish-rescue-submit" type="button" disabled={submitting || (rescueRound === 2 && Boolean(rescue))} onClick={submitRescue}>
            {submitting ? "正在判断下一步" : rescueRound === 2 && rescue ? "复查已完成" : followUp ? "复查现在的变化" : "看看现在怎么救"}
          </button>
          {status && <p className="dish-rescue-status" role="status" aria-live="polite">{status}</p>}

          {rescue && (
            <div className="dish-rescue-result">
              <span className="dish-rescue-round">第 {rescueRound} 轮{rescueRound === 2 ? " · 最后复查" : " · 先做一步"}</span>
              <h3>{rescue.headline}</h3>
              <div className="dish-rescue-observations">
                <strong>{source === "model" ? "画面里能确认" : source.includes("cache") ? "演示样例判断" : "当前判断依据"}</strong>
                {rescue.visualObservations.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
              </div>
              <ol>
                {rescue.actions.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <strong>{item.title}</strong>
                    <span>{item.instruction}</span>
                    <small>做完看：{item.check}</small>
                  </li>
                ))}
              </ol>
              <p className="dish-rescue-next"><strong>然后：</strong>{rescue.nextStep}</p>
              {rescue.assessment.needsConfirmation && <p className="dish-rescue-question">还需要你确认：{rescue.askUser}</p>}
              <p className="dish-rescue-boundary">{rescue.boundaryReminder}</p>
              {!resolved && rescueRound === 1 && (
                <div className="dish-rescue-followup-actions" aria-label="救援结果复查">
                  <button type="button" onClick={() => beginFollowUp("recheck")}>做完了，拍一下复查</button>
                  <button type="button" onClick={() => beginFollowUp("not_improved")}>没改善，换个办法</button>
                  <button type="button" className="resolved" onClick={() => {
                    setResolved(true);
                    setStatus("已记录这次救援已解决问题");
                  }}>已经解决</button>
                </div>
              )}
              {!resolved && rescueRound === 2 && (
                <div className="dish-rescue-followup-actions final">
                  <button type="button" className="resolved" onClick={() => {
                    setResolved(true);
                    setStatus("已记录复查后问题解决");
                  }}>复查后已解决</button>
                  <span>仍未改善时先停止连续试错，回到文字/语音补充新事实。</span>
                </div>
              )}
              {resolved && <p className="dish-rescue-resolved">这次救援已完成，不再继续追加动作。</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LifeLogCard({ mealName, mealSummary, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [draft, setDraft] = useState(null);
  const [title, setTitle] = useState("");
  const [coverText, setCoverText] = useState("");
  const [voiceover, setVoiceover] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const cameraInputRef = useRef(null);
  const albumInputRef = useRef(null);

  async function prepareImage(file) {
    if (!file) return;
    setStatus("正在处理成品图");
    setDraft(null);
    try {
      const compressed = await compressImage(file, 1280, 0.84);
      setImageDataUrl(compressed);
      setSourceFileName(file.name || "finished-dish.jpg");
      setStatus("成品图已就绪");
    } catch (error) {
      setStatus(error.message || "成品图读取失败");
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await prepareImage(file);
  }

  async function loadSample() {
    setExpanded(true);
    setStatus("正在加载示例成品图");
    try {
      const file = await fetchDemoFile("/demo-assets/菜/黄焖鸡-示例.png", "黄焖鸡-示例.png");
      await prepareImage(file);
    } catch (error) {
      setStatus(error.message || "示例成品图加载失败");
    }
  }

  function applyDraft(nextValue) {
    const nextDraft = normalizeLifeLogDraft(nextValue, mealName);
    setDraft(nextDraft);
    setTitle(nextDraft.titleOptions[0]);
    setCoverText(String(nextDraft.coverText || ""));
    setVoiceover(String(nextDraft.voiceoverDraft || ""));
  }

  async function generateDraft() {
    if (!imageDataUrl) {
      setStatus("请先拍摄或选择一张成品图");
      return;
    }
    setGenerating(true);
    setStatus("正在理解成品图并起草文案");
    try {
      const data = await postJson("/api/generate-life-log", {
        imageDataUrl,
        sourceFileName,
        mealContext: { mealName, summary: mealSummary },
      }, { timeoutMs: 60000 });
      applyDraft(data.lifeLog);
      setStatus("草稿已生成，可逐项修改");
    } catch {
      applyDraft(fallbackLifeLogDraft(mealName));
      setStatus("模型暂不可用，已生成可编辑兜底草稿");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="life-log-card">
      <div className="life-log-heading">
        <h2>饭后记录</h2>
        <p>做好后拍一下成品，生成可编辑的标题、封面文案、旁白和补拍建议。</p>
      </div>
      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)}>拍成品，生成生活记录草稿</button>
      ) : (
        <div className="life-log-workspace">
          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
          <input ref={albumInputRef} hidden type="file" accept="image/*" onChange={handleFileChange} />
          <div className="life-log-upload-actions">
            <button type="button" onClick={() => cameraInputRef.current?.click()}>拍成品</button>
            <button type="button" onClick={() => albumInputRef.current?.click()}>从相册选</button>
            <button type="button" onClick={loadSample}>用示例黄焖鸡</button>
          </div>

          {imageDataUrl && (
            <figure className="life-log-preview">
              <img src={imageDataUrl} alt="待生成生活记录草稿的成品图" />
              <figcaption>{sourceFileName || "成品图"}</figcaption>
            </figure>
          )}

          <button className="life-log-generate" type="button" onClick={generateDraft} disabled={generating || !imageDataUrl}>
            {generating ? "正在生成草稿" : draft ? "重新生成草稿" : "生成可编辑草稿"}
          </button>
          {status && <p className="life-log-status" role="status" aria-live="polite">{status}</p>}

          {draft && (
            <div className="life-log-draft">
              <div className="life-log-visual-summary">
                <strong>画面理解</strong>
                <span>{draft.visualSummary}</span>
              </div>

              <div className="life-log-title-options" aria-label="标题建议">
                <span>标题建议</span>
                {draft.titleOptions.map((option) => (
                  <button key={option} type="button" className={title === option ? "active" : ""} onClick={() => setTitle(option)}>
                    {option}
                  </button>
                ))}
              </div>

              <label className="life-log-field">
                <span>标题</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} />
              </label>
              <label className="life-log-field">
                <span>封面文案</span>
                <input value={coverText} onChange={(event) => setCoverText(event.target.value)} maxLength={18} />
              </label>
              <label className="life-log-field">
                <span>旁白草稿</span>
                <textarea value={voiceover} onChange={(event) => setVoiceover(event.target.value)} rows={4} maxLength={180} />
              </label>

              <div className="life-log-shots">
                <strong>之后可补拍</strong>
                <ol>
                  {draft.suggestedShots.map((item, index) => (
                    <li key={`${item.shot}-${index}`}>
                      <span>{item.shot}</span>
                      <small>{item.onScreenText}</small>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="life-log-tags" aria-label="建议标签">
                {draft.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <p className="life-log-boundary">{draft.warnings[0] || "草稿需确认并编辑，不会自动发布。"} 本功能不会自动发布。</p>
              <button
                className="life-log-save"
                type="button"
                onClick={() => {
                  setStatus("当前演示草稿已确认，仍需你手动发布");
                  onAction("生活记录草稿已确认，未自动发布");
                }}
              >
                确认当前演示草稿
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
