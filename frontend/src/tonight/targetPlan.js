import { mergeIngredientNames } from "./model.js";

const TARGET_STATUSES = new Set([
  "confirmed_food",
  "needs_clarification",
  "non_food",
  "unsafe",
]);

const UNCLEAR_DISH_NAME = /(?:未确认|待确认|无法确认|不能确认|需要确认菜名|需确认菜名|不可食用|非食物|不是(?:一道)?(?:菜|食物))/u;
const PLACEHOLDER_DISH_NAME = /^(?:目标菜|想吃的菜|这道菜|菜品|食物|未知|不确定)$/u;

function cleanText(value) {
  return String(value || "").trim();
}

function cleanSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function isExplicitDishName(value) {
  const name = cleanText(value);
  return Boolean(name) && !PLACEHOLDER_DISH_NAME.test(name) && !UNCLEAR_DISH_NAME.test(name);
}

function assessmentStatus(assessment) {
  const value = typeof assessment === "string"
    ? assessment
    : assessment?.status ?? assessment?.targetStatus ?? assessment?.kind;
  return cleanText(value).toLowerCase();
}

function result({
  requestedDishName = "",
  targetStatus,
  executionDishName = "",
  isExecutableNow = false,
  blockReason = null,
}) {
  return {
    requestedDishName,
    targetStatus,
    executionDishName,
    isExecutableNow,
    blockReason,
    canEnterCooking: isExecutableNow,
  };
}

/**
 * Return the cooking eligibility for one saved plan entry without mutating it.
 *
 * New target-plan entries must expose targetAssessment plus the actual dish
 * represented by executionPlan.dishName. Legacy target entries remain
 * viewable, but fail closed until the user regenerates them through the new gate.
 */
export function getTargetExecutionState(
  entry,
  { allRequiredAcquired = false, pendingPantry = [] } = {},
) {
  const plan = entry?.plan && typeof entry.plan === "object" ? entry.plan : {};
  const simulatedMaterials = mergeIngredientNames(
    entry?.materialState?.simulatedItems,
    entry?.shoppingPreview?.acceptedItems,
  );

  if (entry?.mode === "free") {
    const executionDishName = cleanText(plan.baseMeal?.name);
    const steps = cleanSteps(plan.baseMeal?.steps);
    const decision = cleanText(plan.decision);
    if (decision !== "cook_with_existing_items" && decision !== "quick_meal_first") {
      return result({
        targetStatus: "not_applicable",
        executionDishName,
        blockReason: decision === "cook_with_small_purchase" ? "missing_materials" : "not_cooking",
      });
    }
    if (!isExplicitDishName(executionDishName)) {
      return result({
        targetStatus: "not_applicable",
        executionDishName,
        blockReason: "missing_execution_dish",
      });
    }
    if (steps.length === 0) {
      return result({
        targetStatus: "not_applicable",
        executionDishName,
        blockReason: "missing_execution_steps",
      });
    }
    return result({
      targetStatus: "not_applicable",
      executionDishName,
      isExecutableNow: true,
    });
  }

  const requestedDishName = cleanText(entry?.requestSnapshot?.dishName);
  if (entry?.mode !== "target") {
    return result({
      requestedDishName,
      targetStatus: "unknown",
      blockReason: "missing_plan",
    });
  }

  const hasPendingPantry = Array.isArray(pendingPantry)
    ? pendingPantry.length > 0
    : Boolean(pendingPantry);
  const hasNewContract = plan.targetAssessment !== undefined && plan.targetAssessment !== null;

  if (hasNewContract) {
    const targetStatus = assessmentStatus(plan.targetAssessment);
    const executionDishName = cleanText(plan.executionPlan?.dishName);
    const steps = cleanSteps(plan.executionPlan?.steps);
    const declaredExecutable = plan.executionPlan?.isExecutableNow === true;
    const declaredBlockReason = cleanText(plan.executionPlan?.blockReason) || "not_cooking";

    if (!TARGET_STATUSES.has(targetStatus)) {
      return result({
        requestedDishName,
        targetStatus: targetStatus || "unknown",
        executionDishName,
        blockReason: "unsupported_target_status",
      });
    }
    if (["needs_clarification", "non_food", "unsafe"].includes(targetStatus)) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: targetStatus,
      });
    }
    // 模拟补购只表示“假设补齐后重算”，绝不是用户已经买到的材料事实。
    // 即使 Planner 返回了可执行步骤，也必须等用户显式确认“本次已拿到”后才能开火。
    if (Array.isArray(simulatedMaterials) && simulatedMaterials.length > 0) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: "simulated_materials",
      });
    }
    if (hasPendingPantry) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: "needs_confirmation",
      });
    }
    if (declaredExecutable && declaredBlockReason !== "none") {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: declaredBlockReason,
      });
    }
    if (!declaredExecutable && declaredBlockReason === "missing_materials" && !allRequiredAcquired) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: "missing_materials",
      });
    }
    if (!declaredExecutable && !(declaredBlockReason === "missing_materials" && allRequiredAcquired)) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: declaredBlockReason,
      });
    }
    if (!isExplicitDishName(executionDishName)) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: "missing_execution_dish",
      });
    }
    if (steps.length === 0) {
      return result({
        requestedDishName,
        targetStatus,
        executionDishName,
        blockReason: "missing_execution_steps",
      });
    }
    return result({
      requestedDishName,
      targetStatus,
      executionDishName,
      isExecutableNow: true,
    });
  }

  // 旧会话没有 targetAssessment，无法证明目标已通过新语义门禁。
  // 允许回看结果，但必须重新生成一版后才能进入救援或生活记录。
  return result({
    requestedDishName,
    targetStatus: "legacy",
    executionDishName: cleanText(plan.executionPlan?.dishName || plan.targetDish?.name),
    blockReason: "legacy_requires_regeneration",
  });
}
