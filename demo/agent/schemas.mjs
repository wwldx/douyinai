export const fridgeVisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "uncertainItems", "warnings"],
  properties: {
    items: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "quantityEstimate", "confidence", "state", "notes"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["蔬菜", "蛋奶", "主食", "蛋白质", "速食", "饮料", "调味", "其他"] },
          quantityEstimate: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          state: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    uncertainItems: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "reason"],
        properties: {
          description: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
  },
};

export const dinnerPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "score", "summary", "personalizationNotes", "baseMeal", "stretchMeal", "shoppingUpgrade", "fallback", "commerceSuggestion"],
  properties: {
    decision: { type: "string", enum: ["cook_with_existing_items", "cook_with_small_purchase", "quick_meal_first", "delivery_recommended"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    personalizationNotes: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    baseMeal: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "timeCost", "difficulty", "requiredItems", "steps", "safetyTips"],
      properties: {
        name: { type: "string" },
        why: { type: "string" },
        timeCost: { type: "string" },
        difficulty: { type: "string" },
        requiredItems: { type: "array", maxItems: 8, items: { type: "string" } },
        steps: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
        safetyTips: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
      },
    },
    stretchMeal: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "extraSkill", "timeCost"],
      properties: {
        name: { type: "string" },
        why: { type: "string" },
        extraSkill: { type: "string" },
        timeCost: { type: "string" },
      },
    },
    shoppingUpgrade: {
      type: "object",
      additionalProperties: false,
      required: ["neededItems", "reason", "estimatedCost"],
      properties: {
        neededItems: { type: "array", maxItems: 3, items: { type: "string" } },
        reason: { type: "string" },
        estimatedCost: { type: "string" },
      },
    },
    fallback: {
      type: "object",
      additionalProperties: false,
      required: ["type", "condition", "suggestion"],
      properties: {
        type: { type: "string", enum: ["simple_cook", "quick_meal_or_delivery", "delivery"] },
        condition: { type: "string" },
        suggestion: { type: "string" },
      },
    },
    commerceSuggestion: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title", "item", "reason"],
      properties: {
        type: { type: "string", enum: ["fresh_restock", "delivery", "cookware", "none"] },
        title: { type: "string" },
        item: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
};
