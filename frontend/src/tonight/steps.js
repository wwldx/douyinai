// 共享有效步骤：行动单内联、大字做法视图与做饭救援（2c）同源
// 只读派生，不改动模型原始步骤文本（除「全部缺料已拿到」时的第一步补购改写）

import { namesMatch } from "./model";

export function getRawSteps(entry) {
  if (!entry) return [];
  return entry.mode === "target"
    ? entry.plan?.executionPlan?.steps || []
    : entry.plan?.baseMeal?.steps || [];
}

// 做饭上下文：材料四态影响步骤呈现
export function getCookingContext(entry) {
  const gotIt = entry?.materialState?.acquiredItems || [];
  const accepted = entry?.materialState?.simulatedItems || entry?.shoppingPreview?.acceptedItems || [];
  const missing = entry?.mode === "target"
    ? [...new Set([
      ...(entry.plan?.inventoryMatch?.missingCritical || []),
      ...(entry.plan?.shoppingPlan?.mustBuy || []).map((item) => item.item),
    ])]
    : [];
  // 「全部缺料已拿到」要求确实存在过缺料；无缺料版本不因 gotIt 误触发第一步改写
  const allRequiredAcquired = gotIt.length > 0 && accepted.length === 0 && missing.length > 0 && missing.every(
    (name) => gotIt.some((item) => namesMatch(item, name)),
  );
  const steps = getRawSteps(entry).map((step, index) => {
    if (!allRequiredAcquired || index !== 0 || !String(step).includes("补购")) return step;
    const tail = String(step).split(/[；;]/).slice(1).join("；").trim();
    return `确认本次已拿到的${gotIt.join("、")}与冰箱材料状态。${tail}`;
  });
  return { steps, allRequiredAcquired, gotIt, accepted, missing };
}
