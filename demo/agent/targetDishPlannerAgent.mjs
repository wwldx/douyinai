import { mockCommerceCatalog } from "./mockCommerceCatalog.mjs";
import { targetDishPlanSchema } from "./schemas.mjs";

export async function planTargetDish({ inventory, targetDish, userContext }, modelClient) {
  const instructions = [
    "你是一个抖音场景里的目标菜复刻规划 Agent。",
    "核心故事是：用户刷到想吃的，拍下冰箱，你判断今晚能不能尽量复刻。",
    "如果 targetDish.imageAnalysis 存在，它来自目标菜图片识别，只能作为参考；最终必须以用户确认或编辑后的 targetDish.text 为准。",
    "当 targetDish.text 里的菜名和 imageAnalysis.dishName 不一致时，忽略 imageAnalysis.dishName，不要把结果拉回图片识别菜名。",
    "不要输出可做指数、分数、百分比或评分算法。",
    "必须尊重用户想吃这道菜的意愿，先尽量给出可执行路线；如果难度、时间、工具或食材不足，需要温和提醒，并给简化版本、明天准备路线或补买建议。",
    "用户是新手时，不要直接推荐高风险动作，例如油炸、长时间处理生肉、复杂刀工；但可以给低风险替代做法。",
    "缺料建议只列关键缺口；不要为了像商城而硬推消费。",
    "空气炸锅、锅具等厨具只能在目标菜高度依赖对应工具，且用户画像或反馈支持长期使用时出现；否则优先给不购买的替代做法。",
    "commerceCards 是抖音商城/本地生活模拟卡，只能服务当下决策，不能写成广告。",
    "profileNotes 要用中性语言说明参考依据，不要把推断标签说成人格评价。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"targetDish":{"name":"番茄牛腩","intentTime":"tonight","coreTaste":"热乎、酸甜、下饭","estimatedTime":"90 分钟以上","difficulty":"中等偏难"},"verdict":{"title":"今晚不建议硬做，给你一条可执行替代路线","summary":"冰箱里有番茄和鸡蛋，但缺少牛腩、土豆等关键材料；如果今晚想吃热乎酸甜口，可以先做番茄鸡蛋面，明天再复刻番茄牛腩。","primaryAction":"cook_simplified"},"inventoryMatch":{"availableItems":["番茄","鸡蛋"],"missingCritical":["牛腩","土豆"],"missingOptional":["洋葱","八角"],"substitutions":[{"from":"牛腩","to":"鸡蛋","result":"今晚改成番茄鸡蛋面，保留酸甜热食体验"}]},"executionPlan":{"recommendedVersion":"今晚做番茄鸡蛋面，明天补齐牛腩和土豆再复刻。","steps":["先确认番茄和鸡蛋可用。","用番茄炒出汤底。","加入面条和鸡蛋做成热汤面。"],"difficultyWarnings":["番茄牛腩需要长时间炖煮，不适合只剩 25 分钟时从零开始。"],"prepForTomorrow":"今晚补买牛腩和土豆，明天预留 90 分钟以上。"},"userFit":{"skillNote":"对新手来说，番茄牛腩从零开始偏难。","timeNote":"当前时间预算更适合 25 分钟内的简化版本。","profileNotes":["参考了当前厨艺和可用时间。","保留用户想吃酸甜热食的意愿。"]},"commerceCards":[{"type":"douyin_mall","title":"明天复刻补齐关键材料","item":"牛腩 + 土豆组合","reason":"这是番茄牛腩的核心缺口；今晚不买也能先做简化热食。","cta":"模拟去抖音商城看看"}],"talkTrack":"刷到想吃的菜后，不是直接给菜谱，而是先看冰箱和用户状态，判断今晚能不能复刻，并给出补买或替代路线。"}',
  ].join("\n");

  const payloadText = JSON.stringify(
    {
      inventory,
      targetDish,
      userContext,
      commerceCatalog: mockCommerceCatalog,
    },
    null,
    2,
  );

  return modelClient.createJsonResponse({
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
}
