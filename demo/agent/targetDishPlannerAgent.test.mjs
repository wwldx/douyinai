import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTargetDishPlan } from "./targetDishPlannerAgent.mjs";

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
