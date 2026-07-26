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
  planningMode = "inventory_adapted",
  inventoryStatus = "confirmed",
} = {}) {
  const plan = {
    planContext: { planningMode, inventoryStatus },
    targetDish: { name: legacyDishName },
    verdict: { primaryAction },
    executionPlan: { dishName: executionDishName, steps, isExecutableNow, blockReason },
  };
  if (targetAssessment !== undefined) plan.targetAssessment = targetAssessment;
  return {
    mode: "target",
    requestSnapshot: { dishName: requestedDishName, planningMode, inventoryStatus },
    plan,
  };
}

test("free plan is executable only with a concrete meal name and steps", () => {
  const ready = getTargetExecutionState({
    mode: "free",
    plan: { decision: "cook_with_existing_items", baseMeal: { name: "番茄炒蛋", steps: ["切番茄", "炒鸡蛋"] } },
  });
  assert.equal(ready.requestedDishName, "");
  assert.equal(ready.targetStatus, "not_applicable");
  assert.equal(ready.executionDishName, "番茄炒蛋");
  assert.equal(ready.isExecutableNow, true);
  assert.equal(ready.isSemanticallyExecutable, true);
  assert.equal(ready.canViewSteps, true);
  assert.equal(ready.canClaimReadyNow, true);
  assert.equal(ready.canUseRescue, true);
  assert.equal(ready.canCreateLifeLog, true);
  assert.equal(Object.hasOwn(ready, "canEnterCooking"), false);
  assert.equal(ready.blockReason, null);

  const incomplete = getTargetExecutionState({
    mode: "free",
    plan: { decision: "cook_with_existing_items", baseMeal: { name: "番茄炒蛋", steps: [] } },
  });
  assert.equal(incomplete.canViewSteps, false);
  assert.equal(incomplete.canUseRescue, false);
  assert.equal(incomplete.blockReason, "missing_execution_steps");
});

test("free small-purchase plan exposes the recipe and helpers without claiming readiness", () => {
  const state = getTargetExecutionState({
    mode: "free",
    plan: {
      decision: "cook_with_small_purchase",
      baseMeal: { name: "番茄炒蛋", steps: ["切番茄", "炒鸡蛋"] },
    },
  });

  assert.equal(state.isSemanticallyExecutable, true);
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.canCreateLifeLog, true);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "missing_materials");
});

test("free delivery and unknown decisions keep all execution capabilities closed", () => {
  for (const decision of ["delivery_recommended", ""]) {
    const state = getTargetExecutionState({
      mode: "free",
      plan: { decision, baseMeal: { name: "番茄炒蛋", steps: ["切番茄", "炒鸡蛋"] } },
    });
    assert.equal(state.isSemanticallyExecutable, false);
    assert.equal(state.canViewSteps, false);
    assert.equal(state.canUseRescue, false);
    assert.equal(state.canCreateLifeLog, false);
    assert.equal(state.canClaimReadyNow, false);
    assert.equal(state.isExecutableNow, false);
    assert.equal(state.blockReason, "not_cooking");
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
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.blockReason, null);
});

test("standard recipe exposes steps and cooking helpers without claiming inventory readiness", () => {
  const state = getTargetExecutionState(targetEntry({
    requestedDishName: "回锅肉",
    targetAssessment: { status: "confirmed_food" },
    executionDishName: "回锅肉",
    steps: ["煮肉", "切片", "回锅炒"],
    isExecutableNow: false,
    blockReason: "needs_confirmation",
    primaryAction: "follow_standard_recipe",
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
  }));

  assert.equal(state.isSemanticallyExecutable, true);
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.canCreateLifeLog, true);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "inventory_not_checked");
});

test("standard recipe keeps semantic and execution-shape hard gates", () => {
  for (const entry of [
    targetEntry({
      targetAssessment: { status: "non_food" },
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
    }),
    targetEntry({
      targetAssessment: { status: "confirmed_food" },
      executionDishName: "",
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
    }),
    targetEntry({
      targetAssessment: { status: "confirmed_food" },
      steps: [],
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
    }),
  ]) {
    const state = getTargetExecutionState(entry);
    assert.equal(state.canViewSteps, false);
    assert.equal(state.canUseRescue, false);
    assert.equal(state.canCreateLifeLog, false);
    assert.equal(state.canClaimReadyNow, false);
  }
});

test("new target contract blocks clarification, non-food and unsafe targets", () => {
  for (const status of ["needs_clarification", "non_food", "unsafe"]) {
    const state = getTargetExecutionState(targetEntry({
      targetAssessment: { status },
      executionDishName: "模型不应让这一步可执行",
    }));
    assert.equal(state.targetStatus, status);
    assert.equal(state.isSemanticallyExecutable, false);
    assert.equal(state.canViewSteps, false);
    assert.equal(state.canUseRescue, false);
    assert.equal(state.canCreateLifeLog, false);
    assert.equal(state.blockReason, status);
  }
});

test("unresolved pantry confirmation keeps the recipe and helpers visible but blocks ready-now claims", () => {
  const state = getTargetExecutionState(
    targetEntry({ targetAssessment: { status: "confirmed_food" } }),
    { pendingPantry: ["食用油"] },
  );
  assert.equal(state.isSemanticallyExecutable, true);
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.canCreateLifeLog, true);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "needs_confirmation");
});

test("missing-material target always exposes the recipe but claims readiness only after real acquisition", () => {
  const entry = targetEntry({
    targetAssessment: { status: "confirmed_food" },
    isExecutableNow: false,
    blockReason: "missing_materials",
  });

  const before = getTargetExecutionState(entry);
  assert.equal(before.canViewSteps, true);
  assert.equal(before.canUseRescue, true);
  assert.equal(before.canCreateLifeLog, true);
  assert.equal(before.canClaimReadyNow, false);
  assert.equal(before.isExecutableNow, false);
  assert.equal(before.blockReason, "missing_materials");

  const after = getTargetExecutionState(entry, { allRequiredAcquired: true });
  assert.equal(after.canViewSteps, true);
  assert.equal(after.canUseRescue, true);
  assert.equal(after.canCreateLifeLog, true);
  assert.equal(after.canClaimReadyNow, true);
  assert.equal(after.isExecutableNow, true);
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
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.canCreateLifeLog, true);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "missing_materials");
});

test("confirmed-food not-cooking routes keep all execution capabilities closed", () => {
  const state = getTargetExecutionState(targetEntry({
    targetAssessment: { status: "confirmed_food" },
    executionDishName: "明天再做的黄焖鸡",
    steps: ["提前腌制", "冷藏等待"],
    isExecutableNow: false,
    blockReason: "not_cooking",
    primaryAction: "prep_for_tomorrow",
  }));

  assert.equal(state.isSemanticallyExecutable, false);
  assert.equal(state.canViewSteps, false);
  assert.equal(state.canUseRescue, false);
  assert.equal(state.canCreateLifeLog, false);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "not_cooking");
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
    assert.equal(state.canViewSteps, false);
    assert.equal(state.canUseRescue, false);
    assert.equal(state.canCreateLifeLog, false);
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

test("simulated shopping keeps recipe, rescue and life log available but never unlocks ready-now", () => {
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
  assert.equal(state.isSemanticallyExecutable, true);
  assert.equal(state.canViewSteps, true);
  assert.equal(state.canUseRescue, true);
  assert.equal(state.canCreateLifeLog, true);
  assert.equal(state.canClaimReadyNow, false);
  assert.equal(state.isExecutableNow, false);
  assert.equal(state.blockReason, "simulated_materials");

  // 旧/异常恢复态可能同时存在空数组与 shoppingPreview，空数组不能遮住模拟事实。
  entry.materialState.simulatedItems = [];
  entry.shoppingPreview = { acceptedItems: ["鸡腿肉"] };
  const restoredState = getTargetExecutionState(entry);
  assert.equal(restoredState.canViewSteps, true);
  assert.equal(restoredState.canUseRescue, true);
  assert.equal(restoredState.canCreateLifeLog, true);
  assert.equal(restoredState.canClaimReadyNow, false);
  assert.equal(restoredState.isExecutableNow, false);
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
