import { fridgeVisionSchema } from "./schemas.mjs";

export async function analyzeFridge(imageDataUrl, modelClient) {
  const instructions = [
    "你是一个冰箱食材视觉识别 Agent。",
    "items 只放图片中能明确辨认的可食用食材、饮料、速食和调味品，不要编造。",
    "锅具、餐具、水瓶、保鲜盒等容器不是食材，不要放入 items。",
    "如果只能看见袋子、包装或容器但无法确认内容物，必须放入 uncertainItems，不能用“袋装食材”之类名称参与规划。",
    "对被遮挡、剩菜、新鲜度或存放时间不确定的内容，放入 uncertainItems 或 warnings。",
    "不要声称食材一定新鲜，只能使用“看起来可用”“需要确认新鲜度”“需确认保质期”等保守表达。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"items":[{"name":"番茄","category":"蔬菜","quantityEstimate":"2 个","confidence":0.88,"state":"看起来可用","notes":"中层左侧"}],"uncertainItems":[{"description":"透明袋内食材","reason":"遮挡严重，无法确认"}],"warnings":["图片无法判断食材是否过期或完全新鲜，需要用户自行确认。"]}',
  ].join("\n");

  return modelClient.createJsonResponse({
    timeoutMs: 50_000,
    name: "fridge_vision_result",
    schema: fridgeVisionSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "请识别这张冰箱照片中可以明确确认的食材，并把容器、非食材和看不清的包装排除或标为不确定。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instructions}\n\n请识别这张冰箱照片中可以明确确认的食材，并把容器、非食材和看不清的包装排除或标为不确定。` },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
}
