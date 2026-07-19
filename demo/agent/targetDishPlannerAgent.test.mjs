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
