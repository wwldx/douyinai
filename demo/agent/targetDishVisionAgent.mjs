import { targetDishVisionSchema } from "./schemas.mjs";
import { normalizeTargetDishVisionModelResult } from "./targetDishVisionContract.mjs";

export async function analyzeTargetDish(imageDataUrl, modelClient) {
  const instructions = [
    "你是一个目标菜图片识别 Agent。",
    "用户可能上传的是抖音里刷到的菜品图、外卖图、成品图或截图。",
    "你的任务是识别 1 到 4 个画面证据真正支持的具体菜品候选，并分别提取每个候选自己的关键材料、可能工具、耗时、难度和提醒。",
    "dishOptions 按可信程度排序；第一项是主候选，之后最多三个是相似候选。证据不足时宁可只给一个，不得为凑满四个硬编。",
    "每个 dishOptions 项的材料、耗时、难度、工具和提醒必须只描述该项 name，严禁把主候选详情复制给其它名字。",
    "每个候选都必须给出至少一个关键材料和至少一个工具；确实不需要特殊工具时，requiredTools 写“无特殊工具”，不能留空。",
    "dishOptions[].id 使用 vision-1、vision-2、vision-3、vision-4；provenance 固定为 vision。",
    "dishName 与 dishOptions 第一项 name 一致；dishNameCandidates 与其余项 name 一致，保留这两个旧字段只为兼容旧展示端。",
    "如果画面不足以支持任何具体可食用菜品，dishName 设为空字符串，dishNameCandidates 和 dishOptions 都返回空数组，不得输出“模型结果”“目标菜”“待确认”“未知菜品”等占位词。",
    "不要声称图片里所有材料都能确定；只根据可见线索和常识推测。",
    "不要输出可做指数、分数或购买建议，购买建议由后续复刻规划 Agent 决定。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"dishName":"番茄牛腩","dishNameCandidates":["番茄炖牛肉"],"dishOptions":[{"id":"vision-1","name":"番茄牛腩","likelyIngredients":["牛腩","番茄","土豆"],"estimatedTime":"90 分钟以上","difficulty":"中等偏难","requiredTools":["炖锅"],"warnings":["仅凭图片无法确认肉类种类。"],"provenance":"vision"},{"id":"vision-2","name":"番茄炖牛肉","likelyIngredients":["牛肉","番茄"],"estimatedTime":"60-90 分钟","difficulty":"中等","requiredTools":["炖锅"],"warnings":["无法确认具体牛肉部位。"],"provenance":"vision"}],"confidence":0.72,"dishType":"炖菜","coreTaste":"热乎、酸甜、下饭","likelyIngredients":["牛腩","番茄","土豆"],"optionalIngredients":["洋葱","八角","香叶"],"requiredTools":["炖锅"],"estimatedTime":"90 分钟以上","difficulty":"中等偏难","visualEvidence":["红色汤汁","块状肉类","土豆块"],"warnings":["仅凭图片无法确认肉类种类和调味细节，需要用户确认菜名。"]}',
  ].join("\n");

  const result = await modelClient.createJsonResponse({
    timeoutMs: 40_000,
    name: "target_dish_vision_result",
    schema: targetDishVisionSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "请识别这张目标菜图片，返回最多四个可信候选及各自完整详情。用户之后会从候选中确认一个。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instructions}\n\n请识别这张目标菜图片，返回最多四个可信候选及各自完整详情。用户之后会从候选中确认一个。` },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  return normalizeTargetDishVisionModelResult(result);
}
