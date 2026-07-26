import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const imagePath = process.argv[2];
const baseUrl = String(process.argv[3] || "http://127.0.0.1:4173").replace(/\/$/, "");
const endpoint = process.argv[4] || "/api/analyze-fridge";
if (!imagePath) {
  throw new Error("用法：node scripts/run-image-endpoint-smoke.mjs <image-path> [base-url] [endpoint]");
}

const imageBuffer = await readFile(imagePath);
const extension = extname(imagePath).toLowerCase();
const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
const response = await fetch(`${baseUrl}${endpoint}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    imageDataUrl: `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
    sourceFileName: basename(imagePath),
  }),
  signal: AbortSignal.timeout(120_000),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  throw new Error(`视觉端点返回 HTTP ${response.status}：${payload.error || "未知错误"}`);
}
if (payload.source !== "model") {
  throw new Error(`要求真实模型来源，实际为 ${payload.source || "unknown"}。`);
}

const result = payload.vision || payload.targetVision || {};
console.log(JSON.stringify({
  ok: true,
  status: response.status,
  endpoint,
  model: payload.model,
  source: payload.source,
  itemNames: Array.isArray(result.items) ? result.items.map((item) => item.name) : undefined,
  dishName: result.dishName,
  usage: payload.usage || null,
  requestId: response.headers.get("x-request-id"),
  serverTiming: response.headers.get("server-timing"),
}, null, 2));
