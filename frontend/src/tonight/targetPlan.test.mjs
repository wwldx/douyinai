import test from "node:test";
import assert from "node:assert/strict";
import { getTargetExecutionState } from "./targetPlan.js";
import { getCookingContext } from "./steps.js";
import { pantryConfirmationForPlanning } from "./model.js";

function targetEntry({
  requestedDishName = "黄焖鸡",
  targetAssessment,
  executionDishName = "黄焖鸡",
  steps = ["备菜", "焖煮", "收汁"],
  isExecutableNow = true,
  blockReason = "none",
  primaryAction = "cook_now",
  legacyDishName = "黄焖鸡",
} = {}) {
  const plan = {
    targetDish: { name: legacyDishName },
    verdict: { primaryAction },
    executionPlan: { dishName: executionDishName, steps, isExecutableNow, blockReason },
  };
  if (targetAssessment !== undefined) plan.targetAssessment = targetAssessment;
  return {
    mode: "target",
    requestSnapshot: { dishName: requestedDishName },
    plan,
  };
}

test("free plan is executable only with a concrete meal name and steps", () => {
  const ready = getTargetExecutionState({
    mode: "free",
    plan: { decision: "cook_with_existing_items", baseMeal: { name: "番茄炒蛋", steps: ["切番茄", "炒鸡蛋"] } },
  });
  assert.deepEqual(ready, {
    requestedDishName: "",
    targetStatus: "not_applicable",
    executionDishName: "番茄炒蛋",
    isExecutableNow: true,
    blockReason: null,
    canEnterCooking: true,
  });

  const incomplete = getTargetExecutionState({
    mode: "free",
    plan: { decision: "cook_with_existing_items", baseMeal: { name: "番茄炒蛋", steps: [] } },
  });
  assert.equal(incomplete.canEnterCooking, false);
  assert.equal(incomplete.blockReason, "missing_execution_steps");
});

test("free delivery and purchase-first decisions do not enter cooking", () => {
  for (const [decision, reason] of [
    ["delivery_recommended", "not_cooking"],
    ["cook_with_small_purchase", "missing_materials"],
  ]) {
    const state = getTargetExecutionState({
      mode: "free",
      plan: { decision, baseMeal: { name: "番茄炒蛋", steps: ["切番茄", "炒鸡蛋"] } },
    });
    assert.equal(state.canEnterCooking, false);
    assert.equal(state.blockReason, reason);
  }
});

test("new target contract separates requested dish from actual execution dish", () => {
  const state = getTargetExecutionState(targetEntry({
    requestedDishName: "番茄牛腩",
    targetAssessment: { status: "confirmed_food" },
    executionDishName: "番茄鸡蛋面",
  }));

  assert.equal(state.requestedDishName, "番茄牛腩");
  assert.equal(state.targetStatus, "confirmed_food");
  assert.equal(state.executionDishName, "番茄鸡蛋面");
  assert.equal(state.isExecutableNow, true);
  assert.equal(state.canEnterCooking, true);
  assert.equal(state.blockReason, null);
});

test("new target contract blocks clarification, non-food and unsafe targets", () => {
  for (const status of ["needs_clarification", "non_food", "unsafe"]) {
    const state = getTargetExecutionState(targetEntry({
      targetAssessment: { status },
      executionDishName: "模型不应让这一步可执行",
    }));
    assert.equal(state.targetStatus, status);
    assert.equal(state.canEnterCooking, false);
    assert.equal(state.blockReason, status);
  }
});

test("new target contract blocks unresolved pantry confirmation", () => {
  const state = getTargetExecutionState(
    targetEntry({ targetAssessment: { status: "confirmed_food" } }),
    { pendingPantry: ["食用油"] },
  );
  assert.equal(state.canEnterCooking, false);
  assert.equal(state.blockReason, "needs_confirmation");
});

test("missing-material target becomes executable only after all required items are acquired", () => {
  const entry = targetEntry({
    targetAssessment: { status: "confirmed_food" },
    isExecutableNow: false,
    blockReason: "missing_materials",
  });

  const before = getTargetExecutionState(entry);
  assert.equal(before.canEnterCooking, false);
  assert.equal(before.blockReason, "missing_materials");

  const after = getTargetExecutionState(entry, { allRequiredAcquired: true });
  assert.equal(after.canEnterCooking, true);
  assert.equal(after.blockReason, null);
});

test("new target contract requires an actual execution dish and non-empty steps", () => {
  const noDish = getTargetExecutionState(targetEntry({
    targetAssessment: "confirmed_food",
    executionDishName: "",
  }));
  assert.equal(noDish.blockReason, "missing_execution_dish");

  const noSteps = getTargetExecutionState(targetEntry({
    targetAssessment: { targetStatus: "confirmed_food" },
    steps: [],
  }));
  assert.equal(noSteps.blockReason, "missing_execution_steps");
});

test("contradictory executable snapshots fail closed", () => {
  const state = getTargetExecutionState(targetEntry({
    targetAssessment: { status: "confirmed_food" },
    isExecutableNow: true,
    blockReason: "missing_materials",
  }));
  assert.equal(state.canEnterCooking, false);
  assert.equal(state.blockReason, "missing_materials");
});

test("legacy target plans remain viewable but cannot enter cooking without regeneration", () => {
  for (const primaryAction of ["cook_now", "cook_simplified", "shop_then_cook", "prep_for_tomorrow"]) {
    const state = getTargetExecutionState(targetEntry({
      targetAssessment: undefined,
      primaryAction,
      executionDishName: "",
      legacyDishName: "土豆烧鸡",
    }));
    assert.equal(state.targetStatus, "legacy");
    assert.equal(state.executionDishName, "土豆烧鸡");
    assert.equal(state.canEnterCooking, false);
    assert.equal(state.blockReason, "legacy_requires_regeneration");
  }
});

test("strict acquired-material matching never lets oil satisfy oyster sauce", () => {
  const entry = targetEntry({
    targetAssessment: { status: "confirmed_food" },
    isExecutableNow: false,
    blockReason: "missing_materials",
  });
  entry.plan.inventoryMatch = { missingCritical: ["蚝油"] };
  entry.plan.shoppingPlan = { mustBuy: [], confirmAtHome: [] };
  entry.materialState = { acquiredItems: ["油"], simulatedItems: [] };
  assert.equal(getCookingContext(entry).allRequiredAcquired, false);

  entry.materialState.acquiredItems = ["蚝油"];
  assert.equal(getCookingContext(entry).allRequiredAcquired, true);
});

test("simulated shopping never unlocks cooking, rescue or life log", () => {
  const entry = targetEntry({
    targetAssessment: {
      status: "confirmed_food",
      reason: "明确家常菜",
      clarificationPrompt: "",
    },
    executionPlan: {
      isExecutableNow: true,
      dishName: "黄焖鸡",
      blockReason: "none",
      steps: ["处理鸡腿肉", "焖熟收汁"],
    },
  });
  entry.materialState = { acquiredItems: [], simulatedItems: ["鸡腿肉"] };

  const state = getTargetExecutionState(entry);
  assert.equal(state.canEnterCooking, false);
  assert.equal(state.blockReason, "simulated_materials");

  // 旧/异常恢复态可能同时存在空数组与 shoppingPreview，空数组不能遮住模拟事实。
  entry.materialState.simulatedItems = [];
  entry.shoppingPreview = { acceptedItems: ["鸡腿肉"] };
  const restoredState = getTargetExecutionState(entry);
  assert.equal(restoredState.canEnterCooking, false);
  assert.equal(restoredState.blockReason, "simulated_materials");
});

test("derived planning removes covered pantry-missing constraints without mutating the historical fact", () => {
  const historical = {
    availableItems: ["白糖"],
    missingItems: ["食盐", "生抽", "蚝油"],
  };
  const effective = pantryConfirmationForPlanning(historical, {
    acquiredItems: ["盐"],
    simulatedItems: ["生抽", "油"],
  });

  assert.deepEqual(effective, {
    availableItems: ["白糖"],
    missingItems: ["蚝油"],
  });
  assert.deepEqual(historical.missingItems, ["食盐", "生抽", "蚝油"]);
});
