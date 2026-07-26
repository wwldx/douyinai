import { readFile } from "node:fs/promises";

const audioPath = process.argv[2];
const baseUrl = String(process.argv[3] || "http://127.0.0.1:4173").replace(/\/$/, "");
if (!audioPath) {
  throw new Error("用法：node scripts/run-speech-endpoint-smoke.mjs <wav-path> [base-url]");
}

const audioBuffer = await readFile(audioPath);
const response = await fetch(`${baseUrl}/api/transcribe-audio`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    audioDataUrl: `data:audio/wav;base64,${audioBuffer.toString("base64")}`,
  }),
  signal: AbortSignal.timeout(30_000),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  throw new Error(`语音端点返回 HTTP ${response.status}：${payload.error || "未知错误"}`);
}
if (!String(payload.transcript || "").trim()) {
  throw new Error("语音端点成功响应中缺少 transcript。");
}

console.log(JSON.stringify({
  ok: true,
  status: response.status,
  transcript: payload.transcript,
  backend: payload.backend,
  requestId: payload.requestId,
  serverTiming: response.headers.get("server-timing"),
}, null, 2));
