import { fridgeVisionSchema } from "./schemas.mjs";

export async function analyzeFridge(imageDataUrl, modelClient) {
  const instructions = [
    "你是一个冰箱食材视觉识别 Agent。",
    "只识别图片中能看到的食材、饮料、速食、包装和调味线索，不要编造。",
    "对被遮挡、保鲜盒、剩菜、新鲜度或存放时间不确定的内容，放入 uncertainItems 或 warnings。",
    "不要声称食材一定新鲜，只能使用“看起来可用”“需要确认新鲜度”“需确认保质期”等保守表达。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"items":[{"name":"番茄","category":"蔬菜","quantityEstimate":"2 个","confidence":0.88,"state":"看起来可用","notes":"中层左侧"}],"uncertainItems":[{"description":"透明袋内食材","reason":"遮挡严重，无法确认"}],"warnings":["图片无法判断食材是否过期或完全新鲜，需要用户自行确认。"]}',
  ].join("\n");

  return modelClient.createJsonResponse({
    name: "fridge_vision_result",
    schema: fridgeVisionSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "请识别这张冰箱照片中的可见食材，并标注不确定项和安全边界。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instructions}\n\n请识别这张冰箱照片中的可见食材，并标注不确定项和安全边界。` },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
}
