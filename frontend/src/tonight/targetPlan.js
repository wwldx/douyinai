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
  isSemanticallyExecutable = false,
  canViewSteps = false,
  canClaimReadyNow = false,
  canUseRescue = false,
  canCreateLifeLog = false,
  blockReason = null,
}) {
  return {
    requestedDishName,
    targetStatus,
    executionDishName,
    isExecutableNow,
    isSemanticallyExecutable,
    canViewSteps,
    canClaimReadyNow,
    canUseRescue,
    canCreateLifeLog,
    blockReason,
  };
}

function semanticCookingResult({
  requestedDishName = "",
  targetStatus,
  executionDishName,
  readyNow = false,
  blockReason = null,
}) {
  return result({
    requestedDishName,
    targetStatus,
    executionDishName,
    isExecutableNow: readyNow,
    isSemanticallyExecutable: true,
    canViewSteps: true,
    canClaimReadyNow: readyNow,
    canUseRescue: true,
    canCreateLifeLog: true,
    blockReason,
  });
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
    const readyDecision = decision === "cook_with_existing_items" || decision === "quick_meal_first";
    const purchaseDecision = decision === "cook_with_small_purchase";
    if (!readyDecision && !purchaseDecision) {
      return result({
        targetStatus: "not_applicable",
        executionDishName,
        blockReason: "not_cooking",
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
    return semanticCookingResult({
      targetStatus: "not_applicable",
      executionDishName,
      readyNow: readyDecision,
      blockReason: purchaseDecision ? "missing_materials" : null,
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
    // not_cooking 以及与语义门禁矛盾的目标阻断状态，都不得暴露步骤、救援或生活记录。
    if (["not_cooking", "target_unclear", "non_food_target", "unsafe_target"].includes(declaredBlockReason)) {
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
    const planningMode = cleanText(
      entry?.requestSnapshot?.planningMode || plan.planContext?.planningMode,
    );
    if (planningMode === "standard_recipe") {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: "inventory_not_checked",
      });
    }
    // 模拟补购、常备待确认和真实缺料只限制“现在能做”的声称，
    // 不再阻断用户查看完整菜谱、大字步骤、救援和生活记录。
    if (Array.isArray(simulatedMaterials) && simulatedMaterials.length > 0) {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: "simulated_materials",
      });
    }
    if (hasPendingPantry) {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: "needs_confirmation",
      });
    }
    if (declaredExecutable && declaredBlockReason !== "none") {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: declaredBlockReason,
      });
    }
    if (!declaredExecutable && declaredBlockReason === "missing_materials" && !allRequiredAcquired) {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: "missing_materials",
      });
    }
    if (!declaredExecutable && !(declaredBlockReason === "missing_materials" && allRequiredAcquired)) {
      return semanticCookingResult({
        requestedDishName,
        targetStatus,
        executionDishName,
        readyNow: false,
        blockReason: declaredBlockReason === "none" ? "needs_confirmation" : declaredBlockReason,
      });
    }
    return semanticCookingResult({
      requestedDishName,
      targetStatus,
      executionDishName,
      readyNow: true,
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
