export const fridgeVisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sceneAssessment", "items", "uncertainItems", "warnings"],
  properties: {
    sceneAssessment: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "reason"],
      properties: {
        kind: { type: "string", enum: ["fridge", "not_fridge", "unusable"] },
        reason: { type: "string" },
      },
    },
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

export const targetDishVisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dishName", "dishNameCandidates", "dishOptions", "confidence", "dishType", "coreTaste", "likelyIngredients", "optionalIngredients", "requiredTools", "estimatedTime", "difficulty", "visualEvidence", "warnings"],
  properties: {
    dishName: { type: "string" },
    dishNameCandidates: { type: "array", maxItems: 3, items: { type: "string" } },
    dishOptions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "likelyIngredients", "estimatedTime", "difficulty", "requiredTools", "warnings", "provenance"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          likelyIngredients: { type: "array", maxItems: 10, items: { type: "string" } },
          estimatedTime: { type: "string" },
          difficulty: { type: "string" },
          requiredTools: { type: "array", maxItems: 5, items: { type: "string" } },
          warnings: { type: "array", maxItems: 5, items: { type: "string" } },
          provenance: { type: "string", enum: ["vision"] },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    dishType: { type: "string" },
    coreTaste: { type: "string" },
    likelyIngredients: { type: "array", maxItems: 10, items: { type: "string" } },
    optionalIngredients: { type: "array", maxItems: 8, items: { type: "string" } },
    requiredTools: { type: "array", maxItems: 5, items: { type: "string" } },
    estimatedTime: { type: "string" },
    difficulty: { type: "string" },
    visualEvidence: { type: "array", maxItems: 5, items: { type: "string" } },
    warnings: { type: "array", maxItems: 5, items: { type: "string" } },
  },
};

export const lifeLogDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dishName", "confidence", "visualSummary", "titleOptions", "coverText", "voiceoverDraft", "suggestedShots", "tags", "warnings"],
  properties: {
    dishName: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    visualSummary: { type: "string" },
    titleOptions: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    coverText: { type: "string" },
    voiceoverDraft: { type: "string" },
    suggestedShots: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["shot", "onScreenText"],
        properties: {
          shot: { type: "string" },
          onScreenText: { type: "string" },
        },
      },
    },
    tags: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    warnings: { type: "array", maxItems: 5, items: { type: "string" } },
  },
};

export const dishRescueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "visualObservations", "assessment", "actions", "nextStep", "askUser", "boundaryReminder"],
  properties: {
    headline: { type: "string" },
    visualObservations: { type: "array", maxItems: 4, items: { type: "string" } },
    assessment: {
      type: "object",
      additionalProperties: false,
      required: ["category", "likelyIssue", "confidence", "needsConfirmation"],
      properties: {
        category: { type: "string", enum: ["state", "taste", "seasoning", "next_step"] },
        likelyIssue: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        needsConfirmation: { type: "boolean" },
      },
    },
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "instruction", "check"],
        properties: {
          title: { type: "string" },
          instruction: { type: "string" },
          check: { type: "string" },
        },
      },
    },
    nextStep: { type: "string" },
    askUser: { type: "string" },
    boundaryReminder: { type: "string" },
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

export const targetDishPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["planContext", "targetDish", "targetAssessment", "verdict", "standardIngredients", "inventoryMatch", "shoppingPlan", "executionPlan", "userFit", "commerceCards", "talkTrack"],
  properties: {
    planContext: {
      type: "object",
      additionalProperties: false,
      required: ["planningMode", "inventoryStatus"],
      properties: {
        planningMode: { type: "string", enum: ["standard_recipe", "inventory_adapted"] },
        inventoryStatus: { type: "string", enum: ["not_checked", "confirmed_empty", "confirmed"] },
      },
    },
    targetDish: {
      type: "object",
      additionalProperties: false,
      required: ["name", "intentTime", "coreTaste", "estimatedTime", "difficulty"],
      properties: {
        name: { type: "string" },
        intentTime: { type: "string", enum: ["tonight", "tomorrow", "this_week", "unknown"] },
        coreTaste: { type: "string" },
        estimatedTime: { type: "string" },
        difficulty: { type: "string" },
      },
    },
    targetAssessment: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reason", "clarificationPrompt"],
      properties: {
        status: { type: "string", enum: ["confirmed_food", "needs_clarification", "non_food", "unsafe"] },
        reason: { type: "string" },
        clarificationPrompt: { type: "string" },
      },
    },
    verdict: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "primaryAction"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        primaryAction: {
          type: "string",
          enum: [
            "cook_now",
            "cook_simplified",
            "shop_then_cook",
            "prep_for_tomorrow",
            "delivery_or_ready_meal",
            "clarify_target",
            "choose_inventory_meal",
            "follow_standard_recipe",
          ],
        },
      },
    },
    standardIngredients: {
      type: "array",
      maxItems: 16,
      items: { type: "string" },
    },
    inventoryMatch: {
      type: "object",
      additionalProperties: false,
      required: ["availableItems", "missingCritical", "missingOptional", "substitutions"],
      properties: {
        availableItems: { type: "array", maxItems: 8, items: { type: "string" } },
        missingCritical: { type: "array", maxItems: 6, items: { type: "string" } },
        missingOptional: { type: "array", maxItems: 6, items: { type: "string" } },
        substitutions: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "result"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              result: { type: "string" },
            },
          },
        },
      },
    },
    shoppingPlan: {
      type: "object",
      additionalProperties: false,
      required: ["mustBuy", "confirmAtHome", "optionalUpgrades"],
      properties: {
        mustBuy: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "reason"],
            properties: {
              item: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
        confirmAtHome: { type: "array", maxItems: 6, items: { type: "string" } },
        optionalUpgrades: { type: "array", maxItems: 6, items: { type: "string" } },
      },
    },
    executionPlan: {
      type: "object",
      additionalProperties: false,
      required: ["isExecutableNow", "dishName", "blockReason", "recommendedVersion", "steps", "difficultyWarnings", "prepForTomorrow"],
      properties: {
        isExecutableNow: { type: "boolean" },
        dishName: { type: "string" },
        blockReason: {
          type: "string",
          enum: ["none", "target_unclear", "non_food_target", "unsafe_target", "missing_materials", "needs_confirmation", "not_cooking"],
        },
        recommendedVersion: { type: "string" },
        steps: { type: "array", maxItems: 6, items: { type: "string" } },
        difficultyWarnings: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        prepForTomorrow: { type: "string" },
      },
    },
    userFit: {
      type: "object",
      additionalProperties: false,
      required: ["skillNote", "timeNote", "profileNotes"],
      properties: {
        skillNote: { type: "string" },
        timeNote: { type: "string" },
        profileNotes: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      },
    },
    commerceCards: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "item", "reason", "cta"],
        properties: {
          type: { type: "string", enum: ["douyin_mall", "local_life", "cookware", "none"] },
          title: { type: "string" },
          item: { type: "string" },
          reason: { type: "string" },
          cta: { type: "string" },
        },
      },
    },
    talkTrack: {
      type: "string",
    },
  },
};
