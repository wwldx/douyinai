import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

await loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "https://api.openai.com/v1");
const model = process.env.OPENAI_MODEL || (baseUrl.includes("right.codes") ? "gpt-5.5" : "gpt-4.1-mini");
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
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
    }
  }
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

async function createStructuredResponse({ instructions, input, schema, name }) {
  if (!apiKey) {
    const error = new Error("缺少 OPENAI_API_KEY，已回退到本地缓存演示。");
    error.status = 503;
    throw error;
  }

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

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI API 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("模型没有返回可解析文本。");
  return JSON.parse(text);
}

async function analyzeFridge(imageDataUrl) {
  return createStructuredResponse({
    name: "fridge_vision_result",
    schema: fridgeVisionSchema,
    instructions: [
      "你是一个冰箱食材视觉识别 Agent。",
      "只识别图片中能看到的食材、饮料、速食、包装和调味线索，不要编造。",
      "对被遮挡、保鲜盒、剩菜、新鲜度或存放时间不确定的内容，放入 uncertainItems 或 warnings。",
      "不要声称食材一定新鲜，只能使用“看起来可用”“需要确认新鲜度”“需确认保质期”等保守表达。",
      "输出必须是中文固定 JSON。",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "请识别这张冰箱照片中的可见食材，并标注不确定项和安全边界。" },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
  });
}

async function planDinner({ inventory, userContext }) {
  return createStructuredResponse({
    name: "dinner_plan_result",
    schema: dinnerPlanSchema,
    instructions: [
      "你是一个现实主义晚餐规划 Agent。",
      "你需要根据已确认冰箱库存、用户厨艺、口味偏好、近期饮食和今晚可用时间，推荐一顿现实可执行的晚餐。",
      "不要只给菜谱，要先判断今晚适不适合自己做。",
      "新手用户不要推荐高风险动作，例如油炸、复杂刀工、处理整鱼整鸡。",
      "必须考虑时间、精力和安全边界；如果时间太晚或食材风险高，优先速食或外卖兜底。",
      "至少输出一个保底方案；缺料只推荐 0 到 3 个关键补买项。",
      "商业建议必须克制，服务用户当下决策，不能硬推消费。",
      "输出必须是中文固定 JSON。",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({ inventory, userContext }, null, 2),
          },
        ],
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
      sendJson(res, 200, { ok: true, baseUrl, model, hasApiKey: Boolean(apiKey), disableResponseStorage });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze-fridge") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传图片 data URL。" });
        return;
      }
      const vision = await analyzeFridge(body.imageDataUrl);
      sendJson(res, 200, { provider: baseUrl.includes("right.codes") ? "rightcode" : "openai", model, vision });
      return;
    }

    if (req.method === "POST" && req.url === "/api/plan-dinner") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext) {
        sendJson(res, 400, { error: "缺少 inventory 或 userContext。" });
        return;
      }
      const plan = await planDinner({ inventory: body.inventory, userContext: body.userContext });
      sendJson(res, 200, { provider: baseUrl.includes("right.codes") ? "rightcode" : "openai", model, plan });
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
  console.log(`Model endpoint: ${baseUrl}`);
  console.log(apiKey ? `Model: ${model}` : "未设置 OPENAI_API_KEY，将使用前端缓存兜底。");
});
