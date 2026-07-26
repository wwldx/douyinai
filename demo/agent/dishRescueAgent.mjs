import { dishRescueSchema } from "./schemas.mjs";

const CATEGORY_LABELS = {
  state: "状态不对",
  taste: "味道不对",
  seasoning: "调料怎么补",
  next_step: "不知道下一步",
};

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

function cleanSteps(value) {
  return Array.isArray(value) ? value.map((item) => cleanText(item, 100)).filter(Boolean).slice(0, 6) : [];
}

function cleanFollowUp(value) {
  if (!value || Number(value.round) !== 2) return null;
  const outcome = value.outcome === "not_improved" ? "not_improved" : "recheck";
  return {
    round: 2,
    outcome,
    previousHeadline: cleanText(value.previousHeadline, 100),
    previousAction: cleanText(value.previousAction, 180),
    previousCheck: cleanText(value.previousCheck, 140),
  };
}

export function enforceDishRescueBoundaries(value, { category, symptom, dishContext = {} } = {}) {
  if (!value || typeof value !== "object") return value;
  const userCannotConfirmStage = category === "next_step"
    && (!cleanText(dishContext.currentStep, 100) || /说不清|忘了做到哪/.test(cleanText(symptom, 40)));
  if (!userCannotConfirmStage) return value;

  value.assessment = {
    ...(value.assessment || {}),
    category: "next_step",
    confidence: value.assessment?.confidence === "low" ? "low" : "medium",
    needsConfirmation: true,
  };
  if (!cleanText(value.askUser, 180)) {
    value.askUser = "请确认刚完成的最后一个动作；如果仍说不清，先按上面的观察点只做一步再回来复查。";
  }
  return value;
}

function action(title, instruction, check) {
  return { title, instruction, check };
}

function stateFallback(symptom) {
  const map = {
    "太稀": action("先收一小段", "转中小火并保持可控翻动，先观察液体能否自然收浓，不要一次加入大量增稠材料。", "观察锅铲划过后汤汁是否能短暂留下痕迹。"),
    "太干": action("先停下继续加热", "转小火或暂时离火，少量分次补入与原菜相容的水或无盐汤汁，每次混匀后再决定是否继续。", "确认锅底重新有少量流动液体，食材没有继续粘住。"),
    "粘锅/糊锅": action("立即离火，别刮锅底", "把上层未焦部分轻轻转移到干净锅具，不要翻起已经焦黑的锅底，再按原步骤小火继续。", "闻到持续焦味或看到大面积焦黑时，不要继续混入整锅。"),
    "不成形": action("先降低扰动", "转小火，暂停频繁翻动，让表面先稳定；需要翻面时用锅铲完整托住再操作。", "确认边缘开始固定后再进行下一次翻动。"),
    "油水分离": action("先把火调小", "暂停继续加油，少量分次加入原配方中的水相材料并持续混合，每次稳定后再继续。", "观察油珠是否从大片分层变成较均匀的小滴。"),
    "结块": action("先离火拆小块", "暂停加热，用锅铲或打蛋器把明显结块压散；需要补液时少量分次加入并充分混匀。", "确认大块减少且整体重新均匀后再恢复小火。"),
    "颜色不对": action("先核对当前阶段", "不要只为追颜色盲目加调料；先确认是否还没完成煸炒、上色或收汁，再按原方案推进一个步骤。", "比较完成下一步骤后的颜色变化，再决定是否调整。"),
    "快溢锅": action("立即降火并留出空间", "先调到小火，移开或错开锅盖，必要时短暂离火，等泡沫回落后再继续。", "确认液面回落且不再快速上冲。"),
  };
  return map[symptom] || action("先暂停扩大问题", "转小火或暂时离火，保留当前状态并补充你看到的稀稠、颜色、分层或焦糊迹象。", "确认最明显的异常后再做一次小幅调整。");
}

function tasteFallback(symptom) {
  const map = {
    "太咸": "先停止继续加盐或咸味调料，取一小份用无盐同类基底稀释试味，确认有效后再处理整锅。",
    "太淡": "保持小火，少量分次补入原配方中的主要调味，每次混匀并由你试味后再决定是否继续。",
    "太辣": "先分出一小份，用不含辣味的主料或汤汁缓和并试味，不要直接向整锅大量加水。",
    "太酸": "先取一小份，用原菜中的非酸性基底少量分次调整并试味，避免一次加入大量糖掩盖。",
    "太甜": "先停止加糖，取一小份用无糖同类基底少量分次调整并试味，再决定是否处理整锅。",
  };
  return action("按你尝到的味道小步修正", map[symptom] || "先暂停加调料，取一小份少量分次调整，每次都由你试味确认。", "只在小份试味有效后，再把同样方向应用到整锅。" );
}

function seasoningFallback(symptom) {
  const detail = {
    "忘记放调料": "先对照原步骤确认漏掉的是哪一种，再判断此时是否还能补；无法确认时不要把所有调料一起倒入。",
    "放多了": "先停止继续添加，取一小份用不含该调料的同类基底缓和，确认有效后再处理整锅。",
    "现在该放什么": "先对照原方案的当前步骤，只补这一阶段明确需要的调料，不提前把后续调料全部加入。",
    "替代调料": "先说明缺少哪一种调料和家里有什么，再按作用选择替代，不只按名字相近替换。",
  }[symptom] || "先说明缺少或误放了什么，再对照原方案小步调整。";
  return action("一次只改一个变量", `${detail} 采用少量分次加入、每次确认的方式。`, "每次混匀后由你闻味或试味，再决定是否继续。" );
}

export function buildDishRescueFallback({ category, symptom, description, dishContext = {}, followUp }) {
  const normalizedCategory = CATEGORY_LABELS[category] ? category : "state";
  const issue = cleanText(symptom, 40) || CATEGORY_LABELS[normalizedCategory];
  const normalizedFollowUp = cleanFollowUp(followUp);
  let primaryAction;
  if (normalizedFollowUp?.outcome === "not_improved") {
    primaryAction = action(
      "先别重复刚才的调整",
      "保持小火或暂时离火，不要继续叠加调料或火力；对照新画面和你的描述，只确认哪里没有改善或出现了什么新变化。",
      "确认变化后再换一个变量，避免连续操作把原因混在一起。",
    );
  } else if (normalizedFollowUp) {
    primaryAction = action(
      "先比较这次变化",
      "先不要继续加料或升火，对照上一步的观察点，确认稀稠、形态、分层、颜色或焦糊迹象是否真的改善。",
      "只有变化方向明确后，再决定继续、停止或换一个动作。",
    );
  } else if (normalizedCategory === "taste") primaryAction = tasteFallback(issue);
  else if (normalizedCategory === "seasoning") primaryAction = seasoningFallback(issue);
  else if (normalizedCategory === "next_step") {
    primaryAction = action("先确认你做到哪一步", "对照原方案步骤，告诉我最近完成的动作，以及锅里现在是否仍有明显液体或生料。", "确认当前阶段后再只推进一个下一动作。" );
  } else primaryAction = stateFallback(issue);

  const dishName = cleanText(dishContext.dishName, 40) || "这道菜";
  const reported = cleanText(description, 120);
  const nextStep = normalizedFollowUp
    ? "这轮只做一次复查；仍不确定或继续恶化时先停止操作，改由用户补充事实，不连续试错。"
    : normalizedCategory === "next_step"
    ? "先不要连续推进多个步骤；确认当前阶段后，只执行原方案中的下一项。"
    : "完成一次小幅调整后先观察或试味，再决定是否继续。";

  return {
    headline: normalizedFollowUp ? `${dishName} · 复查上一步后的变化` : `${dishName} · 先处理“${issue}”`,
    visualObservations: ["上游视觉模型暂时不可用，下面仅依据你选择的问题和文字描述给出保守建议。"],
    assessment: {
      category: normalizedCategory,
      likelyIssue: reported ? `${issue}；用户补充：${reported}` : issue,
      confidence: "low",
      needsConfirmation: true,
    },
    actions: [primaryAction],
    nextStep,
    askUser: normalizedCategory === "taste"
      ? "请由你再次试味后告诉我变化，图片不能判断咸淡酸甜辣。"
      : normalizedCategory === "next_step"
        ? "你最近完成的是哪一步？锅里现在是生、半熟、焖煮中还是收汁中？"
        : "执行一次后，告诉我画面状态是否改善；不确定时先不要继续加料。",
    boundaryReminder: normalizedCategory === "taste"
      ? "味道来自用户试味和描述，不是从图片判断。"
      : "仅凭图片不能判断气味、准确用量，也不能确认肉蛋是否安全熟透。",
  };
}

export function buildDishRescueInstructions({ category, symptom, description, dishContext = {}, followUp }) {
  const dishName = cleanText(dishContext.dishName, 40) || "未确认菜名";
  const servings = cleanText(dishContext.servings, 20) || "未确认";
  const currentStep = cleanText(dishContext.currentStep, 100) || "未确认";
  const steps = cleanSteps(dishContext.steps);
  const normalizedFollowUp = cleanFollowUp(followUp);
  const followUpLines = normalizedFollowUp ? [
    "这是第 2 轮且最后一轮复查，必须比较新画面与上一步的观察点，不得假定已经改善。",
    normalizedFollowUp.outcome === "not_improved"
      ? "用户明确表示没有改善：不要重复上一个动作，只能更换一个变量；证据不足时要求停止并追问。"
      : "用户已执行上一步并请求复查：先判断可见状态是改善、无明显变化还是恶化，再给一个动作。",
    `上一轮结论：${normalizedFollowUp.previousHeadline || "未记录"}`,
    `上一轮动作：${normalizedFollowUp.previousAction || "未记录"}`,
    `原观察点：${normalizedFollowUp.previousCheck || "未记录"}`,
  ] : [];
  return [
    "你是做饭过程中的多模态救援 Agent。用户做到一半卡住了，你要给出保守、可执行、一次只改一个变量的下一动作。",
    "视觉只用于判断可见的稀稠、形态、分层、焦糊迹象、颜色、液面和大致烹饪阶段。",
    "不能从图片判断味道、气味、准确用量；味道问题只能把用户选择或文字/语音描述当作事实。",
    "不能仅凭图片确认肉、蛋是否安全熟透；涉及熟度时必须要求用户按可靠烹饪方式自行确认。",
    "调料建议使用少量分次加入、每次确认的方式，不根据照片虚构精确克数。",
    "不知道下一步时，结合原方案步骤和画面给一个最可能阶段；证据不足就设置 needsConfirmation=true 并追问，不能硬猜。",
    "actions 最多三条，按立即动作、观察点、后续动作排序。只输出合法 JSON，不要 Markdown。",
    `问题类别：${CATEGORY_LABELS[category] || CATEGORY_LABELS.state}`,
    `用户选择的症状：${cleanText(symptom, 40) || "未选择"}`,
    `用户补充：${cleanText(description, 160) || "无"}`,
    `菜名：${dishName}`,
    `人数：${servings}`,
    `用户确认的当前步骤：${currentStep}`,
    `原方案步骤：${steps.length ? steps.join(" -> ") : "未提供"}`,
    ...followUpLines,
  ].join("\n");
}

export async function rescueDish({ imageDataUrl, category, symptom, description, dishContext = {}, followUp }, modelClient) {
  const normalizedFollowUp = cleanFollowUp(followUp);
  const instructions = buildDishRescueInstructions({ category, symptom, description, dishContext, followUp: normalizedFollowUp });
  const requestText = normalizedFollowUp
    ? "请对比当前新画面与上一轮动作的观察点，完成最后一轮复查，并给出一个可验证的下一动作。"
    : "请结合当前做菜画面、用户选择的问题和原方案上下文，给出一次可验证的救援动作。";
  const result = await modelClient.createJsonResponse({
    timeoutMs: 50_000,
    name: "dish_rescue_result",
    schema: dishRescueSchema,
    instructions,
    responsesInput: [{
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: requestText },
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
      ],
    }],
    chatMessages: [{
      role: "user",
      content: [
        { type: "text", text: `${instructions}\n\n请结合这张当前做菜画面给出救援建议。` },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    }],
  });
  return enforceDishRescueBoundaries(result, { category, symptom, dishContext });
}
