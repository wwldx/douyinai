export const userContext = {
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

const defaultPlan = {
  decision: "cook_with_existing_items",
  score: 92,
  summary: "",
  baseMeal: {
    name: "",
    why: "",
    timeCost: "",
    difficulty: "",
    requiredItems: [],
    steps: [],
    safetyTips: [],
  },
  stretchMeal: {
    name: "",
    why: "",
    extraSkill: "",
    timeCost: "",
  },
  shoppingUpgrade: {
    neededItems: [],
    reason: "",
    estimatedCost: "",
  },
  fallback: {
    type: "simple_cook",
    condition: "",
    suggestion: "",
  },
  commerceSuggestion: {
    type: "none",
    title: "",
    item: "",
    reason: "",
  },
};

export const samples = [
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
      ...defaultPlan,
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
      ...defaultPlan,
      decision: "cook_with_existing_items",
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
      ...defaultPlan,
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

export const fallbackUploadPlan = {
  ...samples[0].plan,
  score: 86,
  summary: "已接收现场上传图片。请先调用视觉识别 Agent，再确认库存并生成晚餐方案。",
};

export function normalizeVision(vision) {
  return {
    items: Array.isArray(vision?.items) ? vision.items : [],
    uncertainItems: Array.isArray(vision?.uncertainItems) ? vision.uncertainItems : [],
    warnings: Array.isArray(vision?.warnings) ? vision.warnings : ["模型未返回安全边界，需人工确认食材状态。"],
  };
}

export function normalizePlan(plan) {
  return {
    ...defaultPlan,
    ...plan,
    baseMeal: { ...defaultPlan.baseMeal, ...plan?.baseMeal },
    stretchMeal: { ...defaultPlan.stretchMeal, ...plan?.stretchMeal },
    shoppingUpgrade: { ...defaultPlan.shoppingUpgrade, ...plan?.shoppingUpgrade },
    fallback: { ...defaultPlan.fallback, ...plan?.fallback },
    commerceSuggestion: { ...defaultPlan.commerceSuggestion, ...plan?.commerceSuggestion },
  };
}
