import assert from "node:assert/strict";
import test from "node:test";
import { targetDishPlanSchema } from "./schemas.mjs";
import {
  normalizeTargetDishPlanningRequest,
  planTargetDish,
  sanitizeTargetDishPlan,
} from "./targetDishPlannerAgent.mjs";

function executableFoodPlan(name = "番茄炒蛋") {
  return {
    targetDish: {
      name,
      intentTime: "tonight",
      coreTaste: "家常",
      estimatedTime: "20 分钟",
      difficulty: "简单",
    },
    targetAssessment: {
      status: "confirmed_food",
      reason: "这是明确的具体食物。",
      clarificationPrompt: "",
    },
    verdict: {
      title: `今晚可以做${name}`,
      summary: "已具备当前做法需要的材料。",
      primaryAction: "cook_now",
    },
    inventoryMatch: {
      availableItems: ["鸡蛋", "番茄"],
      missingCritical: [],
      missingOptional: [],
      substitutions: [],
    },
    shoppingPlan: {
      mustBuy: [],
      confirmAtHome: [],
      optionalUpgrades: [],
    },
    executionPlan: {
      isExecutableNow: true,
      dishName: name,
      blockReason: "none",
      recommendedVersion: `家常${name}`,
      steps: ["准备材料。", "按家常做法烹饪。", "确认熟度后出锅。"],
      difficultyWarnings: ["食材状态和熟度由用户自行确认。"],
      prepForTomorrow: "",
    },
    userFit: {
      skillNote: "适合新手。",
      timeNote: "符合当前时间。",
      profileNotes: ["按用户确认条件规划。"],
    },
    commerceCards: [],
    talkTrack: "当前可以执行。",
  };
}

function assertBlockedTarget(plan, {
  status,
  primaryAction,
  blockReason,
}) {
  assert.equal(plan.targetAssessment.status, status);
  assert.equal(plan.verdict.primaryAction, primaryAction);
  assert.deepEqual(plan.inventoryMatch.availableItems, []);
  assert.deepEqual(plan.inventoryMatch.missingCritical, []);
  assert.deepEqual(plan.inventoryMatch.missingOptional, []);
  assert.deepEqual(plan.inventoryMatch.substitutions, []);
  assert.deepEqual(plan.shoppingPlan.mustBuy, []);
  assert.deepEqual(plan.shoppingPlan.confirmAtHome, []);
  assert.deepEqual(plan.shoppingPlan.optionalUpgrades, []);
  assert.deepEqual(plan.commerceCards, []);
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.dishName, "");
  assert.equal(plan.executionPlan.blockReason, blockReason);
  assert.deepEqual(plan.executionPlan.steps, []);
}

test("target dish shopping confirmation splits corrupted quoted entries and removes cookware", () => {
  const plan = {
    shoppingPlan: {
      confirmAtHome: [
        "食用油",
        "料酒或姜片（用于处理鸡肉）\",\"炒锅和锅盖\"",
        "食用油",
      ],
    },
  };

  const sanitized = sanitizeTargetDishPlan(plan);

  assert.equal(sanitized, plan);
  assert.deepEqual(sanitized.shoppingPlan.confirmAtHome, [
    "食用油",
    "料酒或姜片（用于处理鸡肉）",
  ]);
});

test("target dish shopping confirmation keeps normal ingredient names", () => {
  const plan = {
    shoppingPlan: {
      confirmAtHome: ["盐", "生抽", "火锅底料"],
    },
  };

  sanitizeTargetDishPlan(plan);

  assert.deepEqual(plan.shoppingPlan.confirmAtHome, ["盐", "生抽", "火锅底料"]);
});

test("target dish pantry confirmations resolve pending items without mixing material states", () => {
  const plan = {
    inventoryMatch: { missingCritical: ["食用油", "鸡腿肉", "盐"] },
    shoppingPlan: {
      mustBuy: [
        { item: "食用油", reason: "炒制需要" },
        { item: "鸡腿肉", reason: "主料" },
        { item: "盐", reason: "调味" },
      ],
      confirmAtHome: ["食用油", "盐", "生抽"],
    },
  };

  sanitizeTargetDishPlan(plan, {
    inventory: [{ name: "食用油" }],
    userContext: {
      context: {
        pantryConfirmation: {
          availableItems: ["食用油"],
          missingItems: ["盐"],
        },
      },
    },
  });

  assert.deepEqual(plan.shoppingPlan.confirmAtHome, ["生抽"]);
  assert.deepEqual(plan.inventoryMatch.missingCritical, ["鸡腿肉", "盐"]);
  assert.deepEqual(plan.shoppingPlan.mustBuy.map((item) => item.item), ["鸡腿肉", "盐"]);
});

test("target dish pantry missing confirmation promotes a still-required pending item", () => {
  const plan = {
    inventoryMatch: { missingCritical: [] },
    shoppingPlan: { mustBuy: [], confirmAtHome: ["盐"], optionalUpgrades: [] },
  };

  sanitizeTargetDishPlan(plan, {
    userContext: { context: { pantryConfirmation: { availableItems: [], missingItems: ["盐"] } } },
  });

  assert.deepEqual(plan.shoppingPlan.confirmAtHome, []);
  assert.deepEqual(plan.inventoryMatch.missingCritical, ["盐"]);
  assert.deepEqual(plan.shoppingPlan.mustBuy, [{ item: "盐", reason: "用户已确认家里没有" }]);
});

test("target dish pantry matching never treats oil as oyster sauce", () => {
  const plan = {
    inventoryMatch: { missingCritical: ["蚝油"] },
    shoppingPlan: {
      mustBuy: [{ item: "蚝油", reason: "当前做法需要" }],
      confirmAtHome: [],
      optionalUpgrades: [],
    },
  };

  sanitizeTargetDishPlan(plan, {
    userContext: { context: { pantryConfirmation: { availableItems: ["油"], missingItems: [] } } },
  });

  assert.deepEqual(plan.inventoryMatch.missingCritical, ["蚝油"]);
  assert.deepEqual(plan.shoppingPlan.mustBuy.map((item) => item.item), ["蚝油"]);
});

test("target assessment requiring clarification cannot leak shopping or cooking actions", () => {
  const plan = executableFoodPlan("皮卡丘");
  plan.targetAssessment = {
    status: "needs_clarification",
    reason: "这可能是角色名，也可能指造型食物。",
    clarificationPrompt: "你想吃的是皮卡丘造型饭团、蛋糕，还是别的食物？",
  };
  plan.inventoryMatch.missingCritical = ["黄色色素"];
  plan.shoppingPlan.mustBuy = [{ item: "黄色色素", reason: "造型需要" }];
  plan.commerceCards = [{ type: "douyin_mall", title: "补材料", item: "黄色色素", reason: "", cta: "加入" }];

  sanitizeTargetDishPlan(plan);

  assertBlockedTarget(plan, {
    status: "needs_clarification",
    primaryAction: "clarify_target",
    blockReason: "target_unclear",
  });
  assert.match(plan.verdict.summary, /皮卡丘造型饭团/);
});

test("non-food target is deterministically blocked even when model returned a cook plan", () => {
  const plan = executableFoodPlan("鸡屎");
  plan.targetAssessment = {
    status: "non_food",
    reason: "这是生物排泄物，不是食物。",
    clarificationPrompt: "",
  };
  plan.shoppingPlan.confirmAtHome = ["盐"];
  plan.commerceCards = [{ type: "douyin_mall", title: "错误商品", item: "盐", reason: "", cta: "加入" }];

  sanitizeTargetDishPlan(plan);

  assertBlockedTarget(plan, {
    status: "non_food",
    primaryAction: "choose_inventory_meal",
    blockReason: "non_food_target",
  });
  assert.match(plan.targetAssessment.clarificationPrompt, /具体可食用的菜/);
});

test("unsafe target is deterministically blocked with no execution context", () => {
  const plan = executableFoodPlan("无法安全家常处理的高风险目标");
  plan.targetAssessment = {
    status: "unsafe",
    reason: "普通家常处理无法合理消除这一目标的严重风险。",
    clarificationPrompt: "",
  };

  sanitizeTargetDishPlan(plan);

  assertBlockedTarget(plan, {
    status: "unsafe",
    primaryAction: "choose_inventory_meal",
    blockReason: "unsafe_target",
  });
});

test("confirmed food names are not rejected by substring keywords", () => {
  for (const name of ["鸡屎藤饼", "皮卡丘造型饭团"]) {
    const plan = executableFoodPlan(name);

    sanitizeTargetDishPlan(plan);

    assert.equal(plan.targetAssessment.status, "confirmed_food");
    assert.equal(plan.executionPlan.isExecutableNow, true);
    assert.equal(plan.executionPlan.dishName, name);
    assert.equal(plan.executionPlan.blockReason, "none");
    assert.equal(plan.verdict.primaryAction, "cook_now");
    assert.equal(plan.executionPlan.steps.length, 3);
  }
});

test("confirmed food with missing materials cannot masquerade as ready to cook", () => {
  const plan = executableFoodPlan("番茄牛腩");
  plan.inventoryMatch.missingCritical = ["牛腩"];
  plan.shoppingPlan.mustBuy = [{ item: "牛腩", reason: "核心主料" }];

  sanitizeTargetDishPlan(plan);

  assert.equal(plan.targetAssessment.status, "confirmed_food");
  assert.equal(plan.verdict.primaryAction, "shop_then_cook");
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.dishName, "番茄牛腩");
  assert.equal(plan.executionPlan.blockReason, "missing_materials");
  assert.equal(plan.executionPlan.steps.length, 3);
});

test("confirmed food with pending home confirmation cannot masquerade as ready to cook", () => {
  const plan = executableFoodPlan("番茄炒蛋");
  plan.shoppingPlan.confirmAtHome = ["食用油"];

  sanitizeTargetDishPlan(plan);

  assert.equal(plan.verdict.primaryAction, "choose_inventory_meal");
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.dishName, "番茄炒蛋");
  assert.equal(plan.executionPlan.blockReason, "needs_confirmation");
  assert.equal(plan.executionPlan.steps.length, 3);
});

test("confirmed food marked non-executable cannot retain a cook-now action or steps", () => {
  const plan = executableFoodPlan("番茄炒蛋");
  plan.executionPlan.isExecutableNow = false;
  plan.executionPlan.blockReason = "not_cooking";

  sanitizeTargetDishPlan(plan);

  assert.equal(plan.verdict.primaryAction, "choose_inventory_meal");
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.dishName, "");
  assert.equal(plan.executionPlan.blockReason, "not_cooking");
  assert.deepEqual(plan.executionPlan.steps, []);
});

test("target dish plan schema exposes explicit planning context and standard ingredients", () => {
  assert.ok(targetDishPlanSchema.required.includes("planContext"));
  assert.ok(targetDishPlanSchema.required.includes("standardIngredients"));
  assert.deepEqual(
    targetDishPlanSchema.properties.planContext.properties.planningMode.enum,
    ["standard_recipe", "inventory_adapted"],
  );
  assert.deepEqual(
    targetDishPlanSchema.properties.planContext.properties.inventoryStatus.enum,
    ["not_checked", "confirmed_empty", "confirmed"],
  );
  assert.ok(
    targetDishPlanSchema.properties.verdict.properties.primaryAction.enum.includes("follow_standard_recipe"),
  );
});

test("planning request normalizer accepts standard null inventory and legacy arrays", () => {
  assert.deepEqual(normalizeTargetDishPlanningRequest({
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
    inventory: null,
  }), {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
    inventory: null,
  });

  const inventory = [{ name: "鸡蛋" }];
  assert.deepEqual(normalizeTargetDishPlanningRequest({ inventory }), {
    planningMode: "inventory_adapted",
    inventoryStatus: "confirmed",
    inventory,
  });
  assert.deepEqual(normalizeTargetDishPlanningRequest({ inventory: [] }), {
    planningMode: "inventory_adapted",
    inventoryStatus: "confirmed_empty",
    inventory: [],
  });
});

test("planning request normalizer rejects illegal mode and inventory combinations", () => {
  const invalidInputs = [
    { planningMode: "standard_recipe", inventoryStatus: "not_checked", inventory: [] },
    { planningMode: "standard_recipe", inventoryStatus: "confirmed", inventory: null },
    { planningMode: "inventory_adapted", inventoryStatus: "not_checked", inventory: [] },
    { planningMode: "inventory_adapted", inventoryStatus: "confirmed", inventory: [] },
    { planningMode: "inventory_adapted", inventoryStatus: "confirmed_empty", inventory: [{ name: "鸡蛋" }] },
    { planningMode: "standard_recipe", inventory: null },
    { inventoryStatus: "not_checked", inventory: null },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => normalizeTargetDishPlanningRequest(input),
      (error) => error?.status === 400 && error?.code === "INVALID_PLANNING_CONTEXT",
    );
  }
});

test("standard recipe sanitizer clears inventory reasoning but keeps concrete food steps", () => {
  const plan = executableFoodPlan("回锅肉");
  plan.planContext = { planningMode: "inventory_adapted", inventoryStatus: "confirmed" };
  plan.standardIngredients = ["五花肉 300 克", "蒜苗", "豆瓣酱", "五花肉 300 克"];
  plan.inventoryMatch.missingCritical = ["五花肉"];
  plan.inventoryMatch.missingOptional = ["甜面酱"];
  plan.inventoryMatch.substitutions = [{ from: "蒜苗", to: "青椒", result: "改版" }];
  plan.shoppingPlan.mustBuy = [{ item: "五花肉", reason: "主料" }];
  plan.shoppingPlan.confirmAtHome = ["盐"];
  plan.shoppingPlan.optionalUpgrades = ["甜面酱"];
  plan.commerceCards = [{ type: "douyin_mall", title: "补材料", item: "五花肉", reason: "主料", cta: "加入" }];

  sanitizeTargetDishPlan(plan, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
    inventory: null,
  });

  assert.deepEqual(plan.planContext, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
  });
  assert.deepEqual(plan.standardIngredients, ["五花肉 300 克", "蒜苗", "豆瓣酱"]);
  assert.deepEqual(plan.inventoryMatch, {
    availableItems: [],
    missingCritical: [],
    missingOptional: [],
    substitutions: [],
  });
  assert.deepEqual(plan.shoppingPlan, {
    mustBuy: [],
    confirmAtHome: [],
    optionalUpgrades: [],
  });
  assert.deepEqual(plan.commerceCards, []);
  assert.equal(plan.targetAssessment.status, "confirmed_food");
  assert.equal(plan.verdict.title, "按标准做法准备「回锅肉」");
  assert.match(plan.verdict.summary, /尚未核对你家冰箱/);
  assert.equal(plan.verdict.primaryAction, "follow_standard_recipe");
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.blockReason, "needs_confirmation");
  assert.equal(plan.executionPlan.dishName, "回锅肉");
  assert.equal(plan.executionPlan.steps.length, 3);
});

test("standard recipe keeps semantic hard gate for non-food targets", () => {
  const plan = executableFoodPlan("鸡屎");
  plan.standardIngredients = ["错误材料"];
  plan.targetAssessment = {
    status: "non_food",
    reason: "这不是食物。",
    clarificationPrompt: "",
  };

  sanitizeTargetDishPlan(plan, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
    inventory: null,
  });

  assert.deepEqual(plan.planContext, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
  });
  assert.deepEqual(plan.standardIngredients, []);
  assertBlockedTarget(plan, {
    status: "non_food",
    primaryAction: "choose_inventory_meal",
    blockReason: "non_food_target",
  });
});

test("standard recipe rejects a confirmed-food model result without full execution context", () => {
  const plan = executableFoodPlan("回锅肉");
  plan.standardIngredients = [];

  assert.throws(
    () => sanitizeTargetDishPlan(plan, {
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
      inventory: null,
    }),
    (error) => error?.status === 502 && error?.code === "MODEL_RESPONSE_INVALID",
  );
});

test("standard recipe never promotes a missing semantic assessment to confirmed food", () => {
  const plan = executableFoodPlan("回锅肉");
  plan.standardIngredients = ["五花肉", "蒜苗", "豆瓣酱"];
  delete plan.targetAssessment;

  assert.throws(
    () => sanitizeTargetDishPlan(plan, {
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
      inventory: null,
    }),
    (error) => error?.status === 502 && error?.code === "MODEL_RESPONSE_INVALID",
  );
});

test("planTargetDish sends null inventory for standard mode and overwrites model context", async () => {
  const returned = executableFoodPlan("回锅肉");
  returned.planContext = { planningMode: "inventory_adapted", inventoryStatus: "confirmed" };
  returned.standardIngredients = ["五花肉", "蒜苗", "豆瓣酱"];
  returned.inventoryMatch.missingCritical = ["五花肉"];
  returned.shoppingPlan.mustBuy = [{ item: "五花肉", reason: "主料" }];
  let modelRequest;
  const modelClient = {
    async createJsonResponse(request) {
      modelRequest = request;
      return returned;
    },
  };

  const plan = await planTargetDish({
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
    inventory: null,
    targetDish: { text: "回锅肉", intentTime: "tonight", imageAnalysis: null },
    userContext: { context: { availableCookingTime: "15 分钟" } },
  }, modelClient);

  const payload = JSON.parse(modelRequest.responsesInput[0].content[0].text);
  assert.deepEqual(payload.planContext, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
  });
  assert.equal(payload.inventory, null);
  assert.deepEqual(payload.commerceCatalog, []);
  assert.deepEqual(plan.planContext, payload.planContext);
  assert.deepEqual(plan.inventoryMatch.missingCritical, []);
  assert.deepEqual(plan.shoppingPlan.mustBuy, []);
  assert.equal(plan.executionPlan.dishName, "回锅肉");
  assert.equal(plan.executionPlan.steps.length, 3);
  assert.equal(plan.executionPlan.isExecutableNow, false);
  assert.equal(plan.executionPlan.blockReason, "needs_confirmation");
});

test("legacy array call remains inventory adapted and discards standard ingredients", async () => {
  const returned = executableFoodPlan("番茄炒蛋");
  returned.planContext = { planningMode: "standard_recipe", inventoryStatus: "not_checked" };
  returned.standardIngredients = ["不应保留"];
  const modelClient = { createJsonResponse: async () => returned };

  const plan = await planTargetDish({
    inventory: [{ name: "番茄" }, { name: "鸡蛋" }],
    targetDish: { text: "番茄炒蛋", intentTime: "tonight", imageAnalysis: null },
    userContext: {},
  }, modelClient);

  assert.deepEqual(plan.planContext, {
    planningMode: "inventory_adapted",
    inventoryStatus: "confirmed",
  });
  assert.deepEqual(plan.standardIngredients, []);
  assert.equal(plan.executionPlan.isExecutableNow, true);
});
