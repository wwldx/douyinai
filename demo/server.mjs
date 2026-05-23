import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

await loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const apiKey = process.env.OPENAI_API_KEY;
const responsesBaseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "https://api.openai.com/v1");
const chatBaseUrl = normalizeBaseUrl(process.env.RIGHTCODE_CHAT_BASE_URL || process.env.OPENAI_CHAT_BASE_URL || "https://www.right.codes/draw");
const provider = process.env.MODEL_PROVIDER || (responsesBaseUrl.includes("right.codes") ? "rightcode_responses_stream" : "openai_responses");
const model = (provider === "rightcode_chat" ? process.env.RIGHTCODE_CHAT_MODEL : undefined) || process.env.OPENAI_MODEL || (provider === "rightcode_chat" ? "gemini-3.1-pro" : "gpt-4.1-mini");
const disableResponseStorage = process.env.DISABLE_RESPONSE_STORAGE === "true" || process.env.OPENAI_STORE === "false";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function loadLocalEnv() {
  const candidates = [
    new URL("../.env.local", import.meta.url),
    new URL("../.env", import.meta.url),
  ];

  for (const candidate of candidates) {
    let text = "";
    try {
      text = await readFile(candidate, "utf8");
    } catch {
      continue;
    }

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = cleanEnvValue(rawValue);
    }
  }
}

function cleanEnvValue(value) {
  return value.trim().replace(/^[\"'“”‘’]|[\"'“”‘’]$/g, "");
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

const fridgeVisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "uncertainItems", "warnings"],
  properties: {
    items: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "quantityEstimate", "confidence", "state", "notes"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["蔬菜", "蛋奶", "主食", "蛋白质", "速食", "饮料", "调味", "其他"] },
          quantityEstimate: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          state: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    uncertainItems: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "reason"],
        properties: {
          description: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
  },
};

const dinnerPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "score", "summary", "baseMeal", "stretchMeal", "shoppingUpgrade", "fallback", "commerceSuggestion"],
  properties: {
    decision: { type: "string", enum: ["cook_with_existing_items", "cook_with_small_purchase", "quick_meal_first", "delivery_recommended"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    baseMeal: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "timeCost", "difficulty", "requiredItems", "steps", "safetyTips"],
      properties: {
        name: { type: "string" },
        why: { type: "string" },
        timeCost: { type: "string" },
        difficulty: { type: "string" },
        requiredItems: { type: "array", maxItems: 8, items: { type: "string" } },
        steps: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
        safetyTips: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
      },
    },
    stretchMeal: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "extraSkill", "timeCost"],
      properties: {
        name: { type: "string" },
        why: { type: "string" },
        extraSkill: { type: "string" },
        timeCost: { type: "string" },
      },
    },
    shoppingUpgrade: {
      type: "object",
      additionalProperties: false,
      required: ["neededItems", "reason", "estimatedCost"],
      properties: {
        neededItems: { type: "array", maxItems: 3, items: { type: "string" } },
        reason: { type: "string" },
        estimatedCost: { type: "string" },
      },
    },
    fallback: {
      type: "object",
      additionalProperties: false,
      required: ["type", "condition", "suggestion"],
      properties: {
        type: { type: "string", enum: ["simple_cook", "quick_meal_or_delivery", "delivery"] },
        condition: { type: "string" },
        suggestion: { type: "string" },
      },
    },
    commerceSuggestion: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title", "item", "reason"],
      properties: {
        type: { type: "string", enum: ["fresh_restock", "delivery", "cookware", "none"] },
        title: { type: "string" },
        item: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) {
      throw new Error("请求体过大，请压缩图片后重试。");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  const texts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  return texts.join("\n").trim();
}

function extractChatOutputText(response) {
  return response.choices?.[0]?.message?.content?.trim() || "";
}

async function createJsonResponse({ instructions, responsesInput, chatMessages, schema, name }) {
  if (!apiKey) {
    const error = new Error("缺少 OPENAI_API_KEY，已回退到本地缓存演示。");
    error.status = 503;
    throw error;
  }

  if (provider === "rightcode_chat") {
    return requestChatJsonResponse({ messages: chatMessages, name });
  }

  return requestResponsesJsonResponse({ instructions, input: responsesInput, schema, name });
}

async function requestResponsesJsonResponse({ instructions, input, schema, name }) {
  const requestBody = {
    model,
    instructions,
    input,
    text: {
      format: {
        type: "json_schema",
        name,
        schema,
        strict: true,
      },
    },
  };

  if (disableResponseStorage) {
    requestBody.store = false;
  }

  if (provider === "rightcode_responses_stream") {
    requestBody.stream = true;
  }

  const response = await fetch(`${responsesBaseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (requestBody.stream) {
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(extractErrorMessage(raw) || `OpenAI API 请求失败：${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = extractSseOutputText(raw);
    if (!text) throw new Error("模型没有返回可解析文本。");
    return parseJsonObjectFromText(text);
  }

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `OpenAI API 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("模型没有返回可解析文本。");
  return parseJsonObjectFromText(text);
}

async function requestChatJsonResponse({ messages, name }) {
  const response = await fetch(`${chatBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
    }),
  });

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `Right Code chat 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = extractChatOutputText(payload);
  if (!text) throw new Error(`${name} 没有返回可解析文本。`);
  return parseJsonObjectFromText(text);
}

function extractSseOutputText(raw) {
  const deltas = [];
  for (const block of raw.split(/\n\n/)) {
    const dataLine = block.split(/\n/).find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    const data = dataLine.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        deltas.push(event.delta);
      }
      if (event.type === "response.output_text.done" && typeof event.text === "string" && !deltas.length) {
        deltas.push(event.text);
      }
    } catch {
      continue;
    }
  }
  return deltas.join("").trim();
}

function extractErrorMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.message || JSON.stringify(parsed).slice(0, 500);
  } catch {
    return raw.slice(0, 500).replace(/\s+/g, " ");
  }
}

async function parseResponseJson(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error(`模型服务返回非 JSON 响应：${raw.slice(0, 300).replace(/\s+/g, " ")}`);
    error.status = response.status;
    throw error;
  }
}

function parseJsonObjectFromText(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    const preview = candidate.slice(0, 500).replace(/\s+/g, " ");
    throw new Error(`模型返回不是 JSON：${preview}`);
  }
}

async function analyzeFridge(imageDataUrl) {
  const instructions = [
    "你是一个冰箱食材视觉识别 Agent。",
    "只识别图片中能看到的食材、饮料、速食、包装和调味线索，不要编造。",
    "对被遮挡、保鲜盒、剩菜、新鲜度或存放时间不确定的内容，放入 uncertainItems 或 warnings。",
    "不要声称食材一定新鲜，只能使用“看起来可用”“需要确认新鲜度”“需确认保质期”等保守表达。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"items":[{"name":"番茄","category":"蔬菜","quantityEstimate":"2 个","confidence":0.88,"state":"看起来可用","notes":"中层左侧"}],"uncertainItems":[{"description":"透明袋内食材","reason":"遮挡严重，无法确认"}],"warnings":["图片无法判断食材是否过期或完全新鲜，需要用户自行确认。"]}',
  ].join("\n");

  return createJsonResponse({
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

async function planDinner({ inventory, userContext }) {
  const instructions = [
    "你是一个现实主义晚餐规划 Agent。",
    "你需要根据已确认冰箱库存、用户厨艺、口味偏好、近期饮食和今晚可用时间，推荐一顿现实可执行的晚餐。",
    "不要只给菜谱，要先判断今晚适不适合自己做。",
    "新手用户不要推荐高风险动作，例如油炸、复杂刀工、处理整鱼整鸡。",
    "必须考虑时间、精力和安全边界；如果时间太晚或食材风险高，优先速食或外卖兜底。",
    "至少输出一个保底方案；缺料只推荐 0 到 3 个关键补买项。",
    "商业建议必须克制，服务用户当下决策，不能硬推消费。",
    "必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    'JSON 格式：{"decision":"cook_with_existing_items","score":88,"summary":"今晚建议做简单热食。","baseMeal":{"name":"番茄鸡蛋面","why":"耗时短，适合新手。","timeCost":"20 分钟","difficulty":"新手友好","requiredItems":["番茄","鸡蛋","面条"],"steps":["处理食材。","开火烹饪。","调味出锅。"],"safetyTips":["确认食材新鲜。","注意热油和热水。"]},"stretchMeal":{"name":"青菜鸡蛋面","why":"补充蔬菜。","extraSkill":"简单切配","timeCost":"25 分钟"},"shoppingUpgrade":{"neededItems":["青菜"],"reason":"提升完整度。","estimatedCost":"5-8 元"},"fallback":{"type":"quick_meal_or_delivery","condition":"如果时间不足","suggestion":"选择速食或清淡外卖。"},"commerceSuggestion":{"type":"fresh_restock","title":"轻补货","item":"青菜","reason":"只补关键材料。"}}',
  ].join("\n");
  const payloadText = JSON.stringify({ inventory, userContext }, null, 2);

  return createJsonResponse({
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

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, normalized);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true, provider, responsesBaseUrl, chatBaseUrl, model, hasApiKey: Boolean(apiKey), disableResponseStorage });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze-fridge") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传图片 data URL。" });
        return;
      }
      const vision = await analyzeFridge(body.imageDataUrl);
      sendJson(res, 200, { provider, model, vision });
      return;
    }

    if (req.method === "POST" && req.url === "/api/plan-dinner") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext) {
        sendJson(res, 400, { error: "缺少 inventory 或 userContext。" });
        return;
      }
      const plan = await planDinner({ inventory: body.inventory, userContext: body.userContext });
      sendJson(res, 200, { provider, model, plan });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`冰箱晚餐 Agent demo: http://localhost:${port}/`);
  console.log(`Model provider: ${provider}`);
  console.log(`Responses endpoint: ${responsesBaseUrl}`);
  console.log(`Chat endpoint: ${chatBaseUrl}`);
  console.log(apiKey ? `Model: ${model}` : "未设置 OPENAI_API_KEY，将使用前端缓存兜底。");
});
