import { lifeLogDraftSchema } from "./schemas.mjs";

function cleanContext(value, maxLength) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

export async function generateLifeLogDraft({ imageDataUrl, mealContext = {} }, modelClient) {
  const mealName = cleanContext(mealContext.mealName, 40) || "这顿饭";
  const mealSummary = cleanContext(mealContext.summary, 240);
  const instructions = [
    "你是一个抖音生活记录草稿 Agent。",
    "用户上传的是刚完成的一顿饭成品图；请根据可见内容和用户确认的菜名，生成可编辑的短视频生活记录草稿。",
    "titleOptions 给 2-3 个短标题；coverText 是不超过 12 个汉字的封面字；voiceoverDraft 控制在 80 字以内。",
    "suggestedShots 是用户之后可以补拍的镜头建议，不得把未提供的制作过程写成已经拍到或已经发生的事实。",
    "只能描述图片中可见的颜色、摆盘、食材线索和用户提供的菜名；不要断言口感、味道、营养、热量、实际耗时或食品安全。",
    "不要声称已经发布、获得播放量或用户反馈；不要生成购买引导。",
    "warnings 至少提醒一次：草稿需由用户确认并编辑后再发布。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    `用户确认的菜名：${mealName}`,
    mealSummary ? `当前方案摘要（仅作上下文，不代表成品事实）：${mealSummary}` : "",
  ].filter(Boolean).join("\n");

  return modelClient.createJsonResponse({
    timeoutMs: 50_000,
    name: "life_log_draft_result",
    schema: lifeLogDraftSchema,
    instructions,
    responsesInput: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "请根据这张成品图生成可编辑的抖音生活记录草稿。镜头列表只能写成补拍建议。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    chatMessages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instructions}\n\n请根据这张成品图生成可编辑的抖音生活记录草稿。` },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
}
