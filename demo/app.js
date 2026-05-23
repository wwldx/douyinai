const userContext = {
  user: {
    name: "小林",
    cookingLevel: "新手",
    preferences: ["少油", "微辣", "不爱洗太多锅"],
    avoid: ["香菜", "复杂刀工", "油炸"],
    recentMeals: ["黄焖鸡外卖", "麻辣烫", "便利店饭团"],
    goal: "今晚想吃热的，但不要太麻烦",
  },
  context: {
    time: "21:10",
    availableCookingTime: "25 分钟",
    energyLevel: "低",
    nextSchedule: "22:00 继续改项目文档",
    weather: "小雨",
  },
};

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

let activeSample = samples[0];
let confirmedItems = new Set(activeSample.vision.items.map((item) => item.name));
let uploadedImageDataUrl = "";
let activeProvider = "mock";
let inventorySource = "缓存样例";
let lastVisionError = "";

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
  resetButton: document.querySelector("#resetButton"),
  contextGrid: document.querySelector("#contextGrid"),
  inventoryCount: document.querySelector("#inventoryCount"),
  inventoryList: document.querySelector("#inventoryList"),
  uncertainBox: document.querySelector("#uncertainBox"),
  decisionTitle: document.querySelector("#decisionTitle"),
  scoreValue: document.querySelector("#scoreValue"),
  decisionSummary: document.querySelector("#decisionSummary"),
  summaryStrip: document.querySelector("#summaryStrip"),
  baseTime: document.querySelector("#baseTime"),
  baseMealName: document.querySelector("#baseMealName"),
  baseWhy: document.querySelector("#baseWhy"),
  baseSteps: document.querySelector("#baseSteps"),
  stretchMealName: document.querySelector("#stretchMealName"),
  stretchMealBody: document.querySelector("#stretchMealBody"),
  shoppingList: document.querySelector("#shoppingList"),
  shoppingReason: document.querySelector("#shoppingReason"),
  fallbackText: document.querySelector("#fallbackText"),
  safetyText: document.querySelector("#safetyText"),
  pitchText: document.querySelector("#pitchText"),
  commerceTitle: document.querySelector("#commerceTitle"),
  commerceBody: document.querySelector("#commerceBody"),
  toast: document.querySelector("#toast"),
};

function setBusy(isBusy, message) {
  elements.analyzeButton.disabled = isBusy || !uploadedImageDataUrl;
  elements.planButton.disabled = isBusy;
  if (message) elements.modeStatus.textContent = message;
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
    baseMeal: { ...samples[0].plan.baseMeal, ...plan?.baseMeal },
    stretchMeal: { ...samples[0].plan.stretchMeal, ...plan?.stretchMeal },
    shoppingUpgrade: { ...samples[0].plan.shoppingUpgrade, ...plan?.shoppingUpgrade },
    fallback: { ...samples[0].plan.fallback, ...plan?.fallback },
    commerceSuggestion: { ...samples[0].plan.commerceSuggestion, ...plan?.commerceSuggestion },
  };
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
  const plan = activeSample.plan;
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

function renderAnalysis() {
  const plan = getAdjustedPlan();
  const required = plan.baseMeal.requiredItems.join("、");
  const shoppingItems = plan.shoppingUpgrade.neededItems.length ? plan.shoppingUpgrade.neededItems : ["无"];

  elements.decisionTitle.textContent = plan.baseMeal.name;
  elements.scoreValue.textContent = plan.score;
  elements.decisionSummary.textContent = plan.summary;
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
}

function render() {
  renderSamples();
  renderContext();
  renderInventory();
  renderAnalysis();
  elements.analyzeButton.disabled = !uploadedImageDataUrl;
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
    setBusy(true, "视觉识别中");
    const data = await postJson("/api/analyze-fridge", { imageDataUrl: uploadedImageDataUrl });
    activeProvider = data.provider || "openai";
    inventorySource = `模型识别 · ${data.model || "model"}`;
    lastVisionError = "";
    activeSample = makeUploadSample(data.vision, fallbackUpload.plan);
    resetConfirmedItems(activeSample);
    renderInventory();
    renderAnalysis();
    elements.modeStatus.textContent = `视觉识别完成：${data.model || "模型"}`;
    showToast("视觉识别完成，请确认库存");
  } catch (error) {
    lastVisionError = error.message || "识别失败";
    inventorySource = "识别失败";
    activeSample = makeUploadSample({ items: [], uncertainItems: [], warnings: [] }, fallbackUpload.plan);
    resetConfirmedItems(activeSample);
    renderInventory();
    renderAnalysis();
    elements.modeStatus.textContent = "识别失败，未使用缓存";
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

  try {
    setBusy(true, "晚餐规划中");
    const data = await postJson("/api/plan-dinner", { inventory, userContext });
    activeProvider = data.provider || "openai";
    activeSample = {
      ...activeSample,
      plan: normalizePlan(data.plan),
    };
    renderAnalysis();
    elements.modeStatus.textContent = `晚餐规划完成：${data.model || "模型"}`;
    showToast("晚餐方案已生成");
  } catch (error) {
    activeProvider = "mock";
    renderAnalysis();
    elements.modeStatus.textContent = "规划失败，保留缓存方案";
    showToast(error.message || "规划失败，保留缓存方案");
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

elements.analyzeButton.addEventListener("click", runVisionAgent);
elements.planButton.addEventListener("click", runDinnerPlanner);

elements.fridgeUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const previewUrl = URL.createObjectURL(file);
  elements.uploadPreview.src = previewUrl;
  elements.uploadPreview.style.display = "block";

  try {
    uploadedImageDataUrl = await fileToDataUrl(file);
  } catch (error) {
    uploadedImageDataUrl = "";
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
  resetConfirmedItems(activeSample);
  elements.fridgeUpload.value = "";
  elements.uploadPreview.style.display = "none";
  elements.uploadPreview.removeAttribute("src");
  elements.modeStatus.textContent = "缓存视觉样例";
  render();
});

render();
