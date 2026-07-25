import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTargetDishPlan } from "./targetDishPlannerAgent.mjs";

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
