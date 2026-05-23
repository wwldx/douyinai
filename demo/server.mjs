import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "./agent/modelClient.mjs";
import { analyzeFridge } from "./agent/fridgeVisionAgent.mjs";
import { planDinner } from "./agent/dinnerPlannerAgent.mjs";
import { createUserMemoryStore } from "./agent/userMemoryStore.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const dataRoot = fileURLToPath(new URL("../data", import.meta.url));

await loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const modelConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  responsesBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "https://api.openai.com/v1"),
  chatBaseUrl: normalizeBaseUrl(process.env.RIGHTCODE_CHAT_BASE_URL || process.env.OPENAI_CHAT_BASE_URL || "https://www.right.codes/draw"),
  provider: process.env.MODEL_PROVIDER || ((process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "").includes("right.codes") ? "rightcode_responses_stream" : "openai_responses"),
  disableResponseStorage: process.env.DISABLE_RESPONSE_STORAGE === "true" || process.env.OPENAI_STORE === "false",
};

modelConfig.model = (modelConfig.provider === "rightcode_chat" ? process.env.RIGHTCODE_CHAT_MODEL : undefined) || process.env.OPENAI_MODEL || (modelConfig.provider === "rightcode_chat" ? "gemini-3.1-pro" : "gpt-4.1-mini");

const modelClient = createModelClient(modelConfig);
const userMemoryStore = createUserMemoryStore(dataRoot);

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

function healthPayload() {
  return {
    ok: true,
    provider: modelConfig.provider,
    responsesBaseUrl: modelConfig.responsesBaseUrl,
    chatBaseUrl: modelConfig.chatBaseUrl,
    model: modelConfig.model,
    hasApiKey: Boolean(modelConfig.apiKey),
    disableResponseStorage: modelConfig.disableResponseStorage,
    agentRuntime: "lightweight-node-agent",
    agents: ["fridgeVisionAgent", "dinnerPlannerAgent"],
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, healthPayload());
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/users") {
      sendJson(res, 200, { users: await userMemoryStore.listUsers() });
      return;
    }

    const userStateMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (req.method === "GET" && userStateMatch) {
      sendJson(res, 200, await userMemoryStore.getUserState(userStateMatch[1]));
      return;
    }

    const feedbackMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/feedback$/);
    if (req.method === "POST" && feedbackMatch) {
      const body = await readJsonBody(req);
      sendJson(res, 200, await userMemoryStore.recordFeedback(feedbackMatch[1], body));
      return;
    }

    const visionCacheMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/vision-cache$/);
    if (req.method === "GET" && visionCacheMatch) {
      sendJson(res, 200, { cache: await userMemoryStore.getVisionCache(visionCacheMatch[1]) });
      return;
    }

    if (req.method === "POST" && visionCacheMatch) {
      const body = await readJsonBody(req);
      sendJson(res, 200, { cache: await userMemoryStore.saveVisionCache(visionCacheMatch[1], body) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze-fridge") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传图片 data URL。" });
        return;
      }
      const vision = await analyzeFridge(body.imageDataUrl, modelClient);
      sendJson(res, 200, { provider: modelConfig.provider, model: modelConfig.model, agent: "fridgeVisionAgent", vision });
      return;
    }

    if (req.method === "POST" && req.url === "/api/plan-dinner") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext) {
        sendJson(res, 400, { error: "缺少 inventory 或 userContext。" });
        return;
      }
      const plan = await planDinner({ inventory: body.inventory, userContext: body.userContext }, modelClient);
      sendJson(res, 200, { provider: modelConfig.provider, model: modelConfig.model, agent: "dinnerPlannerAgent", plan });
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
  console.log(`Agent runtime: lightweight-node-agent`);
  console.log(`Model provider: ${modelConfig.provider}`);
  console.log(`Responses endpoint: ${modelConfig.responsesBaseUrl}`);
  console.log(`Chat endpoint: ${modelConfig.chatBaseUrl}`);
  console.log(modelConfig.apiKey ? `Model: ${modelConfig.model}` : "未设置 OPENAI_API_KEY，将使用前端缓存兜底。");
});
