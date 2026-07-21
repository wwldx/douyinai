import { dinnerPlanSchema } from "./schemas.mjs";

export async function planDinner({ inventory, userContext, retrievedCases = [] }, modelClient) {
  const instructions = [
    "你是一个现实主义晚餐规划 Agent。",
    "你需要根据已确认冰箱库存、用户厨艺、口味偏好、近期饮食、画像 traits 和今晚可用时间，推荐一顿现实可执行的晚餐。",
    "不要只给菜谱，要先判断今晚适不适合自己做。",
    "新手用户不要推荐高风险动作，例如油炸、复杂刀工、处理整鱼整鸡。",
    "必须考虑时间、精力和安全边界；如果时间太晚或食材风险高，优先速食或外卖兜底。",
    "userContext.context.timeBudgetId 是用户亲选的时间语义档；flexible 表示今晚不赶时间，不等于无限时长。做饭耗时只计算从备菜到出锅，补购或配送耗时另计。",
    "如果 userContext.profile.traits 中出现低洗锅、深夜热食、快手饭、清淡偏好等标签，需要在 personalizationNotes 中用中性语言说明参考依据。",
    "不要把推断标签说成人格评价；例如说“近期深夜用餐请求较多”，不要说“你是夜猫子”。",
    "至少输出一个保底方案；缺料只推荐 0 到 3 个关键补买项。",
    "商业建议必须克制，服务用户当下决策，不能硬推消费。",
    "如果输入包含 retrievedCases，它们只是历史参考证据，不是当前事实；当前人工确认库存、时间和用户要求优先级最高。",
    "positive case 只能迁移相同约束下的做法，negative case 用于避免重复历史错误；不得复制与当前库存冲突的结论。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"decision":"cook_with_existing_items","score":88,"summary":"今晚建议做简单热食。","personalizationNotes":["参考了新手厨艺和低精力状态。","近期偏好少洗锅，优先一锅完成。"],"baseMeal":{"name":"番茄鸡蛋面","why":"耗时短，适合新手。","timeCost":"20 分钟","difficulty":"新手友好","requiredItems":["番茄","鸡蛋","面条"],"steps":["处理食材。","开火烹饪。","调味出锅。"],"safetyTips":["确认食材新鲜。","注意热油和热水。"]},"stretchMeal":{"name":"青菜鸡蛋面","why":"补充蔬菜。","extraSkill":"简单切配","timeCost":"25 分钟"},"shoppingUpgrade":{"neededItems":["青菜"],"reason":"提升完整度。","estimatedCost":"5-8 元"},"fallback":{"type":"quick_meal_or_delivery","condition":"如果时间不足","suggestion":"选择速食或清淡外卖。"},"commerceSuggestion":{"type":"fresh_restock","title":"轻补货","item":"青菜","reason":"只补关键材料。"}}',
  ].join("\n");
  const payloadText = JSON.stringify({ inventory, userContext, retrievedCases }, null, 2);

  return modelClient.createJsonResponse({
    timeoutMs: 50_000,
    name: "dinner_plan_result",
    schema: dinnerPlanSchema,
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
}
