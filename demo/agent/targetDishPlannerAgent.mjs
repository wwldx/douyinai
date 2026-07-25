import { mockCommerceCatalog } from "./mockCommerceCatalog.mjs";
import { targetDishPlanSchema } from "./schemas.mjs";

const COOKWARE_NAMES = new Set([
  "炒锅",
  "平底锅",
  "汤锅",
  "锅盖",
  "菜刀",
  "刀具",
  "砧板",
  "空气炸锅",
  "烤箱",
  "微波炉",
  "电饭煲",
  "电磁炉",
  "灶具",
  "炒勺",
  "锅铲",
]);

const TARGET_ASSESSMENT_STATUSES = new Set([
  "confirmed_food",
  "needs_clarification",
  "non_food",
  "unsafe",
]);

const COOK_NOW_ACTIONS = new Set(["cook_now", "cook_simplified"]);
const NON_COOKING_ACTIONS = new Set([
  "prep_for_tomorrow",
  "delivery_or_ready_meal",
  "choose_inventory_meal",
]);

function ingredientKey(value) {
  return String(value?.name || value?.item || value || "")
    .replace(/[\s·、，,（）()]/gu, "")
    .trim();
}

function ingredientMatches(a, b) {
  const x = ingredientKey(a);
  const y = ingredientKey(b);
  const aliases = new Map([
    ["食盐", "盐"],
    ["食用盐", "盐"],
    ["植物油", "食用油"],
    ["植物食用油", "食用油"],
    ["食用植物油", "食用油"],
    ["炒菜油", "食用油"],
  ]);
  const safeX = aliases.get(x) || x;
  const safeY = aliases.get(y) || y;
  return Boolean(safeX && safeY && safeX === safeY);
}

function pantryConfirmationFrom(userContext) {
  const value = userContext?.context?.pantryConfirmation || {};
  const availableItems = Array.isArray(value.availableItems) ? value.availableItems.filter(Boolean) : [];
  const missingItems = Array.isArray(value.missingItems) ? value.missingItems.filter(Boolean) : [];
  return { availableItems, missingItems };
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

function blockedTargetCopy(status, reason, clarificationPrompt) {
  if (status === "needs_clarification") {
    return {
      primaryAction: "clarify_target",
      blockReason: "target_unclear",
      title: "先确认你具体想吃什么",
      reason: reason || "当前目标名称还不足以确认是一道具体食物。",
      clarificationPrompt: clarificationPrompt || "请补充一道具体菜名，或说明它是什么食物。",
    };
  }
  if (status === "non_food") {
    return {
      primaryAction: "choose_inventory_meal",
      blockReason: "non_food_target",
      title: "这个输入不能作为晚餐目标",
      reason: reason || "当前目标不是可以进入烹饪规划的食物。",
      clarificationPrompt: clarificationPrompt || "请换一道具体可食用的菜，或改为按现有库存决定。",
    };
  }
  return {
    primaryAction: "choose_inventory_meal",
    blockReason: "unsafe_target",
    title: "这个目标不适合作为安全烹饪方案",
    reason: reason || "当前目标存在无法通过普通家常烹饪消除的安全风险。",
    clarificationPrompt: clarificationPrompt || "请换一种安全可食用的目标，或改为按现有库存决定。",
  };
}

function enforceBlockedTarget(plan, status) {
  const assessment = ensureObject(plan, "targetAssessment");
  const verdict = ensureObject(plan, "verdict");
  const inventoryMatch = ensureObject(plan, "inventoryMatch");
  const shoppingPlan = ensureObject(plan, "shoppingPlan");
  const executionPlan = ensureObject(plan, "executionPlan");
  const copy = blockedTargetCopy(
    status,
    String(assessment.reason || "").trim(),
    String(assessment.clarificationPrompt || "").trim(),
  );

  assessment.status = status;
  assessment.reason = copy.reason;
  assessment.clarificationPrompt = copy.clarificationPrompt;
  verdict.title = copy.title;
  verdict.summary = `${copy.reason} ${copy.clarificationPrompt}`.trim();
  verdict.primaryAction = copy.primaryAction;

  inventoryMatch.availableItems = [];
  inventoryMatch.missingCritical = [];
  inventoryMatch.missingOptional = [];
  inventoryMatch.substitutions = [];
  shoppingPlan.mustBuy = [];
  shoppingPlan.confirmAtHome = [];
  shoppingPlan.optionalUpgrades = [];
  plan.commerceCards = [];

  executionPlan.isExecutableNow = false;
  executionPlan.dishName = "";
  executionPlan.blockReason = copy.blockReason;
  executionPlan.recommendedVersion = "";
  executionPlan.steps = [];
  executionPlan.prepForTomorrow = "";
  return plan;
}

function blockedReasonFromAction(primaryAction) {
  if (primaryAction === "shop_then_cook") return "missing_materials";
  if (primaryAction === "clarify_target") return "needs_confirmation";
  return "not_cooking";
}

function normalizeConfirmedFoodBlockReason(value) {
  if (["missing_materials", "needs_confirmation", "not_cooking"].includes(value)) return value;
  return "needs_confirmation";
}

function primaryActionForBlockedFood(blockReason, currentAction) {
  if (blockReason === "missing_materials") return "shop_then_cook";
  if (blockReason === "not_cooking" && NON_COOKING_ACTIONS.has(currentAction)) return currentAction;
  return "choose_inventory_meal";
}

function enforceConfirmedFoodExecution(plan) {
  const assessment = ensureObject(plan, "targetAssessment");
  const verdict = ensureObject(plan, "verdict");
  const inventoryMatch = ensureObject(plan, "inventoryMatch");
  const shoppingPlan = ensureObject(plan, "shoppingPlan");
  const executionPlan = ensureObject(plan, "executionPlan");

  assessment.status = "confirmed_food";
  assessment.clarificationPrompt = "";

  const missingCritical = Array.isArray(inventoryMatch.missingCritical)
    ? inventoryMatch.missingCritical.filter(Boolean)
    : [];
  const mustBuy = Array.isArray(shoppingPlan.mustBuy)
    ? shoppingPlan.mustBuy.filter((item) => ingredientKey(item))
    : [];
  const confirmAtHome = Array.isArray(shoppingPlan.confirmAtHome)
    ? shoppingPlan.confirmAtHome.filter(Boolean)
    : [];
  const steps = Array.isArray(executionPlan.steps)
    ? executionPlan.steps.filter((step) => String(step || "").trim())
    : [];
  const dishName = String(executionPlan.dishName || "").trim();
  const primaryAction = verdict.primaryAction;

  let blockReason = null;
  if (missingCritical.length > 0 || mustBuy.length > 0) {
    blockReason = "missing_materials";
  } else if (confirmAtHome.length > 0) {
    blockReason = "needs_confirmation";
  } else if (executionPlan.isExecutableNow !== true) {
    blockReason = executionPlan.blockReason === "none"
      ? blockedReasonFromAction(primaryAction)
      : normalizeConfirmedFoodBlockReason(executionPlan.blockReason);
  } else if (!dishName || steps.length === 0) {
    blockReason = "needs_confirmation";
  } else if (!COOK_NOW_ACTIONS.has(primaryAction)) {
    blockReason = blockedReasonFromAction(primaryAction);
  } else if (executionPlan.blockReason !== "none") {
    blockReason = normalizeConfirmedFoodBlockReason(executionPlan.blockReason);
  }

  if (!blockReason) {
    executionPlan.isExecutableNow = true;
    executionPlan.dishName = dishName;
    executionPlan.blockReason = "none";
    executionPlan.steps = steps;
    return plan;
  }

  executionPlan.isExecutableNow = false;
  executionPlan.blockReason = blockReason;
  executionPlan.dishName = blockReason === "not_cooking" ? "" : dishName;
  executionPlan.steps = blockReason === "not_cooking" ? [] : steps;
  verdict.primaryAction = primaryActionForBlockedFood(blockReason, primaryAction);
  return plan;
}

export function sanitizeTargetDishPlan(plan, { userContext = null } = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return plan;

  const assessmentStatus = plan?.targetAssessment?.status;
  if (TARGET_ASSESSMENT_STATUSES.has(assessmentStatus) && assessmentStatus !== "confirmed_food") {
    return enforceBlockedTarget(plan, assessmentStatus);
  }

  const pantry = pantryConfirmationFrom(userContext);
  if (Array.isArray(plan?.shoppingPlan?.confirmAtHome)) {
    // 这里只消解用户本轮明确确认的常备项；普通库存可能因数量不足仍被 Planner 判为缺口，不能在后处理中擅自删掉。
    const confirmedAvailable = pantry.availableItems;
    const resolvedPantry = [...pantry.availableItems, ...pantry.missingItems];

    const pendingAtHome = [...new Set(
      plan.shoppingPlan.confirmAtHome
        .flatMap(splitCorruptedListEntry)
        .filter((item) => item && !isCookwareEntry(item)),
    )];
    // 只有模型仍将「用户已确认没有」的材料列为待确认时，才确定性迁移到缺料与必买；
    // 若模型已经省略该项，视为它调整了做法，不强行把材料塞回方案。
    const confirmedMissingStillRequired = pendingAtHome.filter((item) => (
      pantry.missingItems.some((missing) => ingredientMatches(missing, item))
    ));

    plan.shoppingPlan.confirmAtHome = pendingAtHome
      .filter((item) => !resolvedPantry.some((resolved) => ingredientMatches(resolved, item)));

    if (!plan.inventoryMatch || typeof plan.inventoryMatch !== "object") plan.inventoryMatch = {};
    const missingCritical = Array.isArray(plan.inventoryMatch.missingCritical)
      ? plan.inventoryMatch.missingCritical
        .filter((item) => !confirmedAvailable.some((available) => ingredientMatches(available, item)))
      : [];
    for (const item of confirmedMissingStillRequired) {
      if (!missingCritical.some((existing) => ingredientMatches(existing, item))) missingCritical.push(item);
    }
    plan.inventoryMatch.missingCritical = missingCritical;

    const mustBuy = Array.isArray(plan.shoppingPlan.mustBuy)
      ? plan.shoppingPlan.mustBuy
        .filter((item) => !confirmedAvailable.some((available) => ingredientMatches(available, item)))
      : [];
    for (const item of confirmedMissingStillRequired) {
      if (!mustBuy.some((existing) => ingredientMatches(existing, item))) {
        mustBuy.push({ item, reason: "用户已确认家里没有" });
      }
    }
    plan.shoppingPlan.mustBuy = mustBuy;
  }

  if (assessmentStatus === "confirmed_food") return enforceConfirmedFoodExecution(plan);
  return plan;
}

function splitCorruptedListEntry(value) {
  return String(value || "")
    .split(/["“”']+\s*[,，;；]\s*["“”']+/u)
    .map((item) => item.replace(/^[\s\\"'“”]+|[\s\\"'“”]+$/gu, "").trim())
    .filter(Boolean);
}

function isCookwareEntry(value) {
  const normalized = String(value || "")
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/\s+/gu, "");
  const parts = normalized.split(/[、和与及/+＋]/u).filter(Boolean);
  return parts.length > 0 && parts.every((part) => COOKWARE_NAMES.has(part));
}

export async function planTargetDish({ inventory, targetDish, userContext, retrievedCases = [] }, modelClient) {
  const instructions = [
    "你是一个抖音场景里的目标菜复刻规划 Agent。",
    "核心故事是：用户刷到想吃的，拍下冰箱，你判断今晚能不能尽量复刻。",
    "如果 targetDish.imageAnalysis 存在，它来自目标菜图片识别，只能作为参考；最终必须以用户确认或编辑后的 targetDish.text 为准。",
    "当 targetDish.text 里的菜名和 imageAnalysis.dishName 不一致时，忽略 imageAnalysis.dishName，不要把结果拉回图片识别菜名。",
    "在规划食材和步骤前，必须先对用户确认文本做语义级目标判断，并填写 targetAssessment；不得用简单关键词黑名单代替语义判断。",
    "targetAssessment.status 规则：明确且可作为食物的具体菜、点心或饮品是 confirmed_food；可能是角色、物体、口味昵称或缺少食物形态，无法确认具体吃什么时是 needs_clarification；明确不是食物时是 non_food；即使与食物有关、但目标本身存在普通家常处理无法合理消除的严重风险时是 unsafe。",
    "边界示例只用于理解语义，不是关键词名单：「鸡屎」单独作为目标是非食物；「鸡屎藤饼」是具体传统食物，不得因包含相同字样误伤；「皮卡丘」单独不足以确定具体食物，应追问；「皮卡丘造型饭团」或「皮卡丘蛋糕」是明确造型食物，应按正常食物评估。",
    "needs_clarification 必须给一句具体 clarificationPrompt；non_food 或 unsafe 也要给用户一个改成具体安全食物、或按库存选餐的出口。confirmed_food 的 clarificationPrompt 必须为空字符串。",
    "只要 targetAssessment.status 不是 confirmed_food，就不得生成缺料、补购、商城卡或烹饪步骤；executionPlan 必须是 isExecutableNow=false、dishName=\"\"、steps=[]，并分别使用 target_unclear、non_food_target 或 unsafe_target 作为 blockReason。",
    "confirmed_food 也不等于现在就能开火：只有实际执行菜明确、关键材料与必要确认均已解决、当前路线确实是 cook_now 或 cook_simplified、且存在可执行步骤时，executionPlan.isExecutableNow 才能为 true，blockReason 必须为 none。",
    "confirmed_food 若仍缺关键材料，使用 blockReason=missing_materials；仍需用户确认常备项或关键事实时使用 needs_confirmation；本轮选择明天准备、外卖、即食或其他不进入做饭步骤的路线时使用 not_cooking。isExecutableNow=false 时 primaryAction 不得是 cook_now 或 cook_simplified，不能冒充已经可以开火。",
    "executionPlan.dishName 是步骤真正对应的实际执行菜，不是机械复制用户原始输入；如果简化成另一道菜，应写简化后的真实菜名。missing_materials 或 needs_confirmation 可以保留补齐/确认后将执行的具体菜名和步骤，但当前必须由 isExecutableNow=false 与 blockReason 阻断；not_cooking 必须输出 dishName=\"\"、steps=[]。",
    "不要输出可做指数、分数、百分比或评分算法。",
    "必须尊重用户想吃这道菜的意愿，先尽量给出可执行路线；如果难度、时间、工具或食材不足，需要温和提醒，并给简化版本、明天准备路线或补买建议。",
    "用户是新手时，不要直接推荐高风险动作，例如油炸、长时间处理生肉、复杂刀工；但可以给低风险替代做法。",
    "inventory 包含用户本轮明确确认可用的材料；来源以每项 category/state 为准，可能是冰箱原有、本次已拿到或用户确认家中常备。冰箱画面没看到某种调料不等于用户家里一定没有。",
    "如果 userContext.context.pantryConfirmation 存在：availableItems 是用户明确确认家中已有的常备材料，必须按真实可用处理；missingItems 是用户明确确认家里没有的材料，不得再次放进 confirmAtHome。missingItems 若是本版必要材料，必须进入 missingCritical 与 mustBuy；若可以不用，则调整做法并说明。",
    "userContext.context.timeBudgetId 是用户亲选的时间语义档；flexible 表示今晚不赶时间，不等于无限时长。做饭耗时只计算从备菜到出锅，补购或配送耗时另计。",
    "shoppingPlan 必须覆盖当前目标菜完整的材料缺口，而不是只挑一个适合展示的商品。mustBuy 列出当前推荐版本不可缺少、且确认库存中没有的主料、辅料和专用调味料；常见但可能放在橱柜里的油、盐、酱油等放进 confirmAtHome；不影响成菜成立的材料放进 optionalUpgrades。",
    "shoppingPlan 的每个数组元素只能写一个简短材料名，不得把 JSON 引号、转义符或多个数组元素拼进同一字符串；锅具和厨具不得写进 confirmAtHome。",
    "inventoryMatch.missingCritical 与 shoppingPlan.mustBuy 的 item 必须一致；专用酱料、香料或主食如果是这道菜成立的必要条件，不能因为不在冰箱画面里就省略。",
    "米饭、面条等搭配主食不能仅因为适合配这道菜就列入 missingCritical 或 mustBuy；只有目标菜本身以该主食为核心组成时才算关键缺口，否则放进 confirmAtHome 或 optionalUpgrades。",
    "预制调味包、专用酱料包不能仅因为更省事就列入 missingCritical 或 mustBuy；只要常见基础调味能做出成立的简化版本，就把调味包放进 confirmAtHome 或 optionalUpgrades。",
    "如果 targetDish.shoppingDecision.acceptedItems 非空，表示用户在模拟购物车中选择补齐这些材料。必须把这些材料视为本轮可用，并重新生成补购后的做法；不得继续把已接受补买的材料列为 missingCritical 或 mustBuy。",
    "不要为了像商城而硬推消费；完整缺口可以为零，且必须区分必须买、回家确认和可选升级。",
    "用户已明确选择自己做饭时，优先给低风险、可简化的烹饪路线；只有确实不存在安全且能在当前时间与工具约束内完成的路线时，才把外卖或即食作为 primaryAction。",
    "不得用肉类颜色、切开后是否粉红、汁水是否清澈或照片外观来证明熟度或可安全食用；只给保守的充分加热步骤，并提醒用户自行确认，不得声称已经安全。",
    "空气炸锅、锅具等厨具只能在目标菜高度依赖对应工具，且用户画像或反馈支持长期使用时出现；否则优先给不购买的替代做法。",
    "commerceCards 是抖音商城/本地生活模拟卡，只能服务当下决策，不能写成广告。",
    "profileNotes 要用中性语言说明参考依据，不要把推断标签说成人格评价。",
    "如果输入包含 retrievedCases，它们只是历史参考证据，不是当前事实；当前人工确认库存、目标菜文字和用户要求优先级最高。",
    "positive case 只能迁移相同约束下的做法，negative case 用于避免重复历史错误；缺关键主料时不能因为历史正例成功就声称当前也能完整做。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"targetDish":{"name":"番茄牛腩","intentTime":"tonight","coreTaste":"热乎、酸甜、下饭","estimatedTime":"90 分钟以上","difficulty":"中等偏难"},"targetAssessment":{"status":"confirmed_food","reason":"这是明确的家常菜目标。","clarificationPrompt":""},"verdict":{"title":"今晚还不能直接开火，先补齐关键材料","summary":"冰箱里有番茄，但缺少牛腩和土豆；补齐后再按完整路线做。","primaryAction":"shop_then_cook"},"inventoryMatch":{"availableItems":["番茄"],"missingCritical":["牛腩","土豆"],"missingOptional":["洋葱","八角"],"substitutions":[]},"shoppingPlan":{"mustBuy":[{"item":"牛腩","reason":"目标菜的核心肉类主料"},{"item":"土豆","reason":"当前版本需要的主要配菜"}],"confirmAtHome":[],"optionalUpgrades":["洋葱","八角"]},"executionPlan":{"isExecutableNow":false,"dishName":"番茄牛腩","blockReason":"missing_materials","recommendedVersion":"补齐牛腩和土豆后再做完整番茄牛腩。","steps":["牛腩焯水后与番茄炒出香味。","加入热水小火炖至牛腩软烂。","加入土豆炖熟并调味收汁。"],"difficultyWarnings":["这些步骤只能在关键材料补齐并由用户确认后执行。"],"prepForTomorrow":"补买牛腩和土豆后，预留 90 分钟以上。"},"userFit":{"skillNote":"对新手来说，番茄牛腩从零开始偏难。","timeNote":"当前时间预算不足以完成完整炖煮。","profileNotes":["参考了当前厨艺和可用时间。","保留用户想吃酸甜热食的意愿。"]},"commerceCards":[{"type":"douyin_mall","title":"目标菜需要补齐","item":"牛腩 + 土豆","reason":"这是当前版本的完整关键缺口。","cta":"加入模拟购物车并重新规划"}],"talkTrack":"先确认目标是具体食物，再区分现在能开火、需要补齐或需要改目标。"}',
  ].join("\n");

  const payloadText = JSON.stringify(
    {
      inventory,
      targetDish,
      userContext,
      retrievedCases,
      commerceCatalog: mockCommerceCatalog,
    },
    null,
    2,
  );

  const plan = await modelClient.createJsonResponse({
    timeoutMs: 50_000,
    name: "target_dish_plan_result",
    schema: targetDishPlanSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: payloadText,
          },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: `${instructions}\n\n输入数据：\n${payloadText}`,
      },
    ],
  });
  return sanitizeTargetDishPlan(plan, { inventory, userContext });
}
