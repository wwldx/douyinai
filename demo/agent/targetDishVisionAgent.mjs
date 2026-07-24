import { targetDishVisionSchema } from "./schemas.mjs";

export async function analyzeTargetDish(imageDataUrl, modelClient) {
  const instructions = [
    "你是一个目标菜图片识别 Agent。",
    "用户可能上传的是抖音里刷到的菜品图、外卖图、成品图或截图。",
    "你的任务是猜测这道菜最可能是什么，并提取复刻它需要的关键材料、可选材料、可能工具、耗时和难度。",
    "如果无法确定菜名，要用保守表达，例如“疑似空气炸锅鸡翅”或“可能是番茄牛腩”。",
    "dishName 必须是具体菜名或具体菜品描述，禁止输出“模型结果”“目标菜”“待确认”“未知菜品”等占位词。",
    "dishNameCandidates 只列 0 到 3 个画面证据同样支持的具体候选菜名，不得重复 dishName；证据充分时优先给 2 到 3 个，证据不足时宁可少给或返回空数组，不得为凑数硬编。",
    "不要声称图片里所有材料都能确定；只根据可见线索和常识推测。",
    "不要输出可做指数、分数或购买建议，购买建议由后续复刻规划 Agent 决定。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"dishName":"疑似番茄牛腩","dishNameCandidates":["番茄炖牛肉"],"confidence":0.72,"dishType":"炖菜","coreTaste":"热乎、酸甜、下饭","likelyIngredients":["牛腩","番茄","土豆"],"optionalIngredients":["洋葱","八角","香叶"],"requiredTools":["炖锅"],"estimatedTime":"90 分钟以上","difficulty":"中等偏难","visualEvidence":["红色汤汁","块状肉类","土豆块"],"warnings":["仅凭图片无法确认肉类种类和调味细节，需要用户确认菜名。"]}',
  ].join("\n");

  return modelClient.createJsonResponse({
    timeoutMs: 22_000,
    name: "target_dish_vision_result",
    schema: targetDishVisionSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "请识别这张目标菜图片，猜测菜名并提取复刻所需关键材料和难点。用户之后会确认或修改菜名。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instructions}\n\n请识别这张目标菜图片，猜测菜名并提取复刻所需关键材料和难点。用户之后会确认或修改菜名。` },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
}
