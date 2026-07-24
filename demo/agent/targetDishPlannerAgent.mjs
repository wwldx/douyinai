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

export function sanitizeTargetDishPlan(plan, { userContext = null } = {}) {
  if (!Array.isArray(plan?.shoppingPlan?.confirmAtHome)) return plan;

  const pantry = pantryConfirmationFrom(userContext);
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
    'JSON 格式：{"targetDish":{"name":"番茄牛腩","intentTime":"tonight","coreTaste":"热乎、酸甜、下饭","estimatedTime":"90 分钟以上","difficulty":"中等偏难"},"verdict":{"title":"今晚不建议硬做，给你一条可执行替代路线","summary":"冰箱里有番茄和鸡蛋，但缺少牛腩、土豆等关键材料；如果今晚想吃热乎酸甜口，可以先做番茄鸡蛋面，补齐后再做完整版。","primaryAction":"cook_simplified"},"inventoryMatch":{"availableItems":["番茄","鸡蛋"],"missingCritical":["牛腩","土豆"],"missingOptional":["洋葱","八角"],"substitutions":[{"from":"牛腩","to":"鸡蛋","result":"今晚改成番茄鸡蛋面，保留酸甜热食体验"}]},"shoppingPlan":{"mustBuy":[{"item":"牛腩","reason":"完整版的核心肉类主料"},{"item":"土豆","reason":"完整版需要的主要配菜"}],"confirmAtHome":["食用油","盐","酱油"],"optionalUpgrades":["洋葱","八角"]},"executionPlan":{"recommendedVersion":"今晚做番茄鸡蛋面，补齐牛腩和土豆后再做完整版。","steps":["先确认番茄和鸡蛋可用。","用番茄炒出汤底。","加入面条和鸡蛋做成热汤面。"],"difficultyWarnings":["番茄牛腩需要长时间炖煮，不适合只剩 25 分钟时从零开始。"],"prepForTomorrow":"补买牛腩和土豆后，预留 90 分钟以上。"},"userFit":{"skillNote":"对新手来说，番茄牛腩从零开始偏难。","timeNote":"当前时间预算更适合 25 分钟内的简化版本。","profileNotes":["参考了当前厨艺和可用时间。","保留用户想吃酸甜热食的意愿。"]},"commerceCards":[{"type":"douyin_mall","title":"完整版需要补齐","item":"牛腩 + 土豆","reason":"这是番茄牛腩的完整必买清单。","cta":"加入模拟购物车并重新规划"}],"talkTrack":"刷到想吃的菜后，先看确认库存；系统区分已有、待确认和必须补买，并让补购结果真正进入下一轮规划。"}',
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
