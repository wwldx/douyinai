import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient, readModelResponseMeta } from "./agent/modelClient.mjs";
import { analyzeFridge } from "./agent/fridgeVisionAgent.mjs";
import { sanitizeFridgeVision } from "./agent/fridgeVisionSanitizer.mjs";
import { analyzeTargetDish } from "./agent/targetDishVisionAgent.mjs";
import { normalizeTargetDishVisionContract } from "./agent/targetDishVisionContract.mjs";
import { generateLifeLogDraft } from "./agent/lifeLogDraftAgent.mjs";
import { buildDishRescueFallback, enforceDishRescueBoundaries, rescueDish } from "./agent/dishRescueAgent.mjs";
import { planDinner } from "./agent/dinnerPlannerAgent.mjs";
import { normalizeTargetDishPlanningRequest, planTargetDish } from "./agent/targetDishPlannerAgent.mjs";
import { createUserMemoryStore } from "./agent/userMemoryStore.mjs";
import { createDemoVisionCache } from "./agent/demoVisionCache.mjs";
import { createCaseRetriever, normalizeRetrievalMode, toPlannerCases } from "./agent/caseRetriever.mjs";
import { matchIngredientSubstitutes } from "./agent/ingredientSubstitutionEngine.mjs";
import { buildEatFirstList } from "./agent/eatFirstEngine.mjs";
import { buildFridgeOrganization } from "./agent/fridgeZoneEngine.mjs";
import { getTencentAsrConfig, transcribeWithTencentAsr } from "./agent/tencentSpeechTranscriber.mjs";
import { createAgentRunStore } from "./agent/agentRunStore.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const showcaseDistRoot = fileURLToPath(new URL("../frontend/dist", import.meta.url));
const demoAssetsRoot = fileURLToPath(new URL("../assets", import.meta.url));
const dataRoot = fileURLToPath(new URL("../data", import.meta.url));
const macSpeechScriptPath = fileURLToPath(new URL("../scripts/mac-speech-transcribe.swift", import.meta.url));
const macSpeechInfoPlistPath = fileURLToPath(new URL("../scripts/mac-speech-transcribe.Info.plist", import.meta.url));
const macSpeechBinaryPath = fileURLToPath(new URL("../build/mac-speech-transcribe", import.meta.url));

await loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const runtimeDataRoot = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : dataRoot;
const modelConfig = {
  apiKey: usableApiKey(process.env.OPENAI_API_KEY),
  responsesBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "https://api.openai.com/v1"),
  chatBaseUrl: normalizeBaseUrl(process.env.RIGHTCODE_CHAT_BASE_URL || process.env.OPENAI_CHAT_BASE_URL || "https://www.rightapi.ai/draw"),
  provider: process.env.MODEL_PROVIDER || (/right(?:\.codes|api\.ai)/u.test(process.env.OPENAI_BASE_URL || process.env.RIGHTCODE_BASE_URL || "") ? "rightcode_responses_stream" : "openai_responses"),
  disableResponseStorage: process.env.DISABLE_RESPONSE_STORAGE === "true" || process.env.OPENAI_STORE === "false",
};

modelConfig.model = (modelConfig.provider === "rightcode_chat" ? process.env.RIGHTCODE_CHAT_MODEL : undefined) || process.env.OPENAI_MODEL || (modelConfig.provider === "rightcode_chat" ? "gemini-3.1-pro" : "gpt-4.1-mini");
const modelRoutes = {
  vision: { ...modelConfig, model: process.env.VISION_MODEL || modelConfig.model },
  planning: { ...modelConfig, model: process.env.PLANNING_MODEL || modelConfig.model },
  lifeLog: { ...modelConfig, model: process.env.LIFE_LOG_MODEL || process.env.VISION_MODEL || modelConfig.model },
};

function usableApiKey(value) {
  const key = String(value || "").trim();
  if (!key || !/^[\x20-\x7e]+$/.test(key)) return undefined;
  if (/填|你的|replace|example|api[_ -]?key/i.test(key)) return undefined;
  return key;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const modelClients = {
  vision: createModelClient(modelRoutes.vision),
  planning: createModelClient(modelRoutes.planning),
  lifeLog: createModelClient(modelRoutes.lifeLog),
};
const userMemoryStore = createUserMemoryStore(dataRoot, runtimeDataRoot);
const demoVisionCache = createDemoVisionCache(dataRoot);
const caseRetriever = createCaseRetriever(dataRoot);
const agentRunStore = createAgentRunStore({ runtimeDataRoot, isProduction });
let macSpeechHelperBuildPromise = null;
const rateLimitBuckets = new Map();
const rateLimitConfig = {
  windowMs: positiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000),
  generalMax: positiveInteger(process.env.API_RATE_LIMIT_MAX, 80),
  modelMax: positiveInteger(process.env.MODEL_RATE_LIMIT_MAX, 30),
  trustProxy: process.env.TRUST_PROXY === "true",
};
const caseRetrievalConfig = {
  mode: normalizeRetrievalMode(process.env.CASE_RETRIEVAL_MODE, "off"),
  limit: Math.min(8, positiveInteger(process.env.CASE_RETRIEVAL_LIMIT, 4)),
  allowRequestOverride: !isProduction || process.env.ALLOW_RETRIEVAL_MODE_OVERRIDE === "true",
};

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

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "same-origin");
  res.setHeader("permissions-policy", "camera=(self), microphone=(self), geolocation=()");
  res.setHeader("cross-origin-resource-policy", "same-origin");
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function clientRateLimitKey(req) {
  if (rateLimitConfig.trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "local";
}

function isModelPath(pathname) {
  return [
    "/api/analyze-fridge",
    "/api/analyze-target-dish",
    "/api/generate-life-log",
    "/api/rescue-dish",
    "/api/transcribe-audio",
    "/api/plan-dinner",
    "/api/plan-target-dish",
  ].includes(pathname);
}

function consumeRateLimit(req, res, pathname) {
  if (!pathname.startsWith("/api/") || pathname === "/api/health") return true;

  const now = Date.now();
  if (rateLimitBuckets.size > 1_000) {
    for (const [bucketKey, bucketValue] of rateLimitBuckets) {
      if (bucketValue.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }
  const group = isModelPath(pathname) ? "model" : "general";
  const max = group === "model" ? rateLimitConfig.modelMax : rateLimitConfig.generalMax;
  const key = `${group}:${clientRateLimitKey(req)}`;
  const current = rateLimitBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + rateLimitConfig.windowMs }
    : current;
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const remaining = Math.max(0, max - bucket.count);
  res.setHeader("ratelimit-limit", String(max));
  res.setHeader("ratelimit-remaining", String(remaining));
  res.setHeader("ratelimit-reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count <= max) return true;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.setHeader("retry-after", String(retryAfter));
  sendJson(res, 429, { error: "请求过于频繁，请稍后再试。", retryAfterSeconds: retryAfter });
  return false;
}

function setServerTiming(res, metrics) {
  const entries = Object.entries(metrics)
    .filter(([, value]) => Number.isFinite(value))
    .map(([name, value]) => `${name};dur=${Math.max(0, Math.round(value))}`);
  if (entries.length) res.setHeader("server-timing", entries.join(", "));
}

function requestRetrievalMode(body, fallback = caseRetrievalConfig.mode) {
  if (!caseRetrievalConfig.allowRequestOverride) return fallback;
  return normalizeRetrievalMode(body?.retrievalMode, fallback);
}

function publicErrorPayload(error, requestId, pathname = "") {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  let message = error.message || "Server error";

  if (isProduction && status >= 500) {
    if (pathname === "/api/transcribe-audio") message = "语音转写暂时不可用，可直接输入文字。";
    else if (status === 503) message = "模型服务尚未配置或暂时不可用。";
    else if (status === 502 || status === 504) message = "上游模型暂时不可用，请稍后重试。";
    else message = "服务暂时不可用，请稍后重试。";
  }

  const payload = { error: message, requestId };
  const publicModelErrorCodes = new Set([
    "MODEL_TIMEOUT",
    "MODEL_CONNECT_ERROR",
    "MODEL_SERVICE_UNAVAILABLE",
    "MODEL_RESPONSE_INVALID",
    "MODEL_REQUEST_ERROR",
  ]);
  if (publicModelErrorCodes.has(error.code)) payload.code = error.code;
  if (!isProduction) {
    if (error.diagnostics) payload.diagnostics = error.diagnostics;
    if (error.errors) payload.errors = error.errors;
  }
  return { status, payload };
}

async function readJsonBody(req) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > 12 * 1024 * 1024) {
    throw Object.assign(new Error("请求体过大，请压缩图片或缩短录音后重试。"), { status: 413 });
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) {
      throw Object.assign(new Error("请求体过大，请压缩图片或缩短录音后重试。"), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("请求体不是合法 JSON。"), { status: 400 });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname);

  if (await directoryExists(showcaseDistRoot)) {
    const showcaseFile = await resolveStaticFile(showcaseDistRoot, requested, true);
    if (showcaseFile) {
      await sendStaticFile(res, showcaseFile, requested.startsWith("/assets/"));
      return;
    }
  }

  const legacyFile = await resolveStaticFile(rootDir, requested, false);
  if (legacyFile) {
    await sendStaticFile(res, legacyFile, false);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

async function directoryExists(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveStaticFile(baseDir, pathname, spaFallback) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^(?:\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const candidate = join(baseDir, normalized);

  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch {
    // Fall through to the SPA entry point when requested.
  }

  if (spaFallback && !extname(normalized)) {
    const indexPath = join(baseDir, "index.html");
    try {
      if ((await stat(indexPath)).isFile()) return indexPath;
    } catch {
      return null;
    }
  }

  return null;
}

async function sendStaticFile(res, filePath, immutable = false) {
  const data = await readFile(filePath);
  res.writeHead(200, {
    "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(data);
}

async function serveSlicedAsset(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname.replace(/^\/sliced\/?/, ""));
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(projectRoot, "sliced", normalized);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "cache-control": "public, max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function healthPayload() {
  const speechProvider = process.env.SPEECH_TRANSCRIBE_PROVIDER || "auto";
  const audioApiConfig = getAudioTranscriptionConfig();
  const tencentAsrConfig = getTencentAsrConfig();
  const payload = {
    ok: true,
    provider: modelConfig.provider,
    model: modelConfig.model,
    modelRouting: {
      vision: modelRoutes.vision.model,
      planning: modelRoutes.planning.model,
      lifeLog: modelRoutes.lifeLog.model,
    },
    modelTimeoutsMs: {
      fridgeVision: 50_000,
      targetDishVision: 40_000,
      planning: 50_000,
      lifeLog: 50_000,
      dishRescue: 50_000,
    },
    hasApiKey: Boolean(modelConfig.apiKey),
    disableResponseStorage: modelConfig.disableResponseStorage,
    agentRuntime: "lightweight-node-agent",
    agents: ["fridgeVisionAgent", "targetDishVisionAgent", "dinnerPlannerAgent", "targetDishPlannerAgent", "lifeLogDraftAgent", "dishRescueAgent", "localSpeechInputAgent"],
    demoVisionCache: {
      enabled: demoVisionCache.enabled,
      fallbackMs: demoVisionCache.fallbackMs,
    },
    speech: {
      provider: speechProvider,
      tencentAsrEnabled: tencentAsrConfig.enabled,
      tencentAsrEngine: tencentAsrConfig.engineType,
      audioApiEnabled: audioApiConfig.enabled,
      audioApiModels: audioApiConfig.enabled ? audioApiConfig.models : [],
      macBackend: "macos_speech_framework",
      locale: process.env.MAC_SPEECH_LOCALE || "zh-CN",
      onDeviceOnly: process.env.MAC_SPEECH_ON_DEVICE_ONLY !== "false",
      autoFallback: process.env.MAC_SPEECH_AUTO_FALLBACK !== "false",
      requires: ["ffmpeg", "optional Tencent Cloud ASR credentials", "optional audio transcriptions API", "optional macOS Speech recognition permission"],
    },
    limits: {
      windowMs: rateLimitConfig.windowMs,
      generalMax: rateLimitConfig.generalMax,
      modelMax: rateLimitConfig.modelMax,
    },
    caseRetrieval: {
      mode: caseRetrievalConfig.mode,
      limit: caseRetrievalConfig.limit,
      requestOverride: caseRetrievalConfig.allowRequestOverride,
    },
    runtimeStorage: {
      customDataDir: runtimeDataRoot !== dataRoot,
    },
    agentRuns: agentRunStore.health(),
    reviewConsole: {
      localOnly: true,
      enabled: !isProduction,
    },
    operationsConsole: {
      enabled: agentRunStore.health().adminApiEnabled,
      path: agentRunStore.health().adminApiEnabled ? "/ops.html" : null,
    },
  };

  if (!isProduction) {
    payload.responsesBaseUrl = modelConfig.responsesBaseUrl;
    payload.chatBaseUrl = modelConfig.chatBaseUrl;
    payload.speech.audioApiBaseUrl = audioApiConfig.enabled ? audioApiConfig.baseUrl : null;
  }

  return payload;
}

function parseDataUrl(dataUrl, expectedPrefix) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)((?:;[^,]+)*),(.+)$/);
  if (!match) {
    throw Object.assign(new Error("请上传有效的音频 data URL。"), { status: 400 });
  }

  const [, mimeType, metadata, payload] = match;
  if (!mimeType.startsWith(expectedPrefix)) {
    throw Object.assign(new Error("请上传音频 data URL。"), { status: 400 });
  }
  if (!metadata.toLowerCase().includes(";base64")) {
    throw Object.assign(new Error("音频 data URL 必须使用 base64。"), { status: 400 });
  }

  return {
    mimeType,
    buffer: Buffer.from(payload, "base64"),
  };
}

function extensionForMimeType(mimeType) {
  const normalizedMime = mimeType.split(";")[0].toLowerCase();
  const extensions = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return extensions[normalizedMime] || "audio";
}

function runCommand(command, args, { timeoutMs = 45000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(Object.assign(new Error(`命令超时：${command}`), { code: "TIMEOUT", stdout, stderr }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(Object.assign(error, { stdout, stderr }));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const exitMessage = signal ? `${command} exited with signal ${signal}` : `${command} exited with code ${code}`;
      reject(Object.assign(new Error(stderr.trim() || exitMessage), { code, signal, stdout, stderr }));
    });
  });
}

async function runFirstAvailableCommand(candidates, args, options) {
  let lastError = null;
  for (const command of candidates.filter(Boolean)) {
    try {
      return await runCommand(command, args, options);
    } catch (error) {
      lastError = error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw lastError || new Error("未找到可用命令。");
}

async function convertAudioToWav(inputPath, outputPath) {
  const ffmpegCandidates = [process.env.FFMPEG_PATH, "ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  await runFirstAvailableCommand(
    ffmpegCandidates,
    ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-ac", "1", "-ar", "16000", "-vn", outputPath],
    { timeoutMs: 30000 },
  );
}

async function inspectAudio(wavPath) {
  const ffmpegCandidates = [process.env.FFMPEG_PATH, "ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  const ffprobeCandidates = [process.env.FFPROBE_PATH, "ffprobe", "/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"];
  const diagnostics = {
    durationSeconds: null,
    meanVolumeDb: null,
    maxVolumeDb: null,
  };

  try {
    const { stdout } = await runFirstAvailableCommand(
      ffprobeCandidates,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wavPath],
      { timeoutMs: 10000 },
    );
    const duration = Number.parseFloat(stdout.trim());
    if (Number.isFinite(duration)) diagnostics.durationSeconds = Number(duration.toFixed(2));
  } catch {
    // Diagnostics only; transcription can continue without duration.
  }

  try {
    const { stderr } = await runFirstAvailableCommand(
      ffmpegCandidates,
      ["-hide_banner", "-nostats", "-i", wavPath, "-af", "volumedetect", "-f", "null", "-"],
      { timeoutMs: 15000 },
    );
    const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
    const maxMatch = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
    if (meanMatch) diagnostics.meanVolumeDb = Number(meanMatch[1]);
    if (maxMatch) diagnostics.maxVolumeDb = Number(maxMatch[1]);
  } catch {
    // Diagnostics only; transcription can continue without volume.
  }

  return diagnostics;
}

function assertAudioIsUsable(diagnostics) {
  if (diagnostics.durationSeconds !== null && diagnostics.durationSeconds < 0.5) {
    throw Object.assign(new Error("录音太短，请按住说完整一句后再结束录音。"), { status: 400, diagnostics });
  }

  if (diagnostics.maxVolumeDb !== null && diagnostics.maxVolumeDb < -45) {
    throw Object.assign(new Error("录音几乎是静音。请检查浏览器麦克风权限、输入设备和系统音量后再试。"), { status: 400, diagnostics });
  }
}

async function ensureMacSpeechHelper(swiftEnv) {
  if (process.env.MAC_SPEECH_HELPER_PATH) {
    return process.env.MAC_SPEECH_HELPER_PATH;
  }

  if (!macSpeechHelperBuildPromise) {
    macSpeechHelperBuildPromise = (async () => {
      if (!(await shouldBuildMacSpeechHelper())) {
        return macSpeechBinaryPath;
      }

      await mkdir(dirname(macSpeechBinaryPath), { recursive: true });
      const swiftcCandidates = [process.env.SWIFTC_PATH, "swiftc", "/usr/bin/swiftc"];
      await runFirstAvailableCommand(
        swiftcCandidates,
        [
          macSpeechScriptPath,
          "-o",
          macSpeechBinaryPath,
          "-framework",
          "Speech",
          "-Xlinker",
          "-sectcreate",
          "-Xlinker",
          "__TEXT",
          "-Xlinker",
          "__info_plist",
          "-Xlinker",
          macSpeechInfoPlistPath,
        ],
        { timeoutMs: 60000, env: swiftEnv },
      );
      return macSpeechBinaryPath;
    })();
  }

  return macSpeechHelperBuildPromise;
}

async function shouldBuildMacSpeechHelper() {
  try {
    const [binary, script, infoPlist] = await Promise.all([
      stat(macSpeechBinaryPath),
      stat(macSpeechScriptPath),
      stat(macSpeechInfoPlistPath),
    ]);
    return binary.mtimeMs < Math.max(script.mtimeMs, infoPlist.mtimeMs);
  } catch {
    return true;
  }
}

async function runMacSpeechHelper(wavPath, { locale, onDeviceOnly, swiftEnv, helperPath }) {
  const args = [wavPath, locale];
  if (onDeviceOnly) {
    args.push("--on-device");
  }

  try {
    const commandOutput = await runCommand(helperPath, args, { timeoutMs: 18000, env: swiftEnv });
    const payload = parseMacSpeechPayload(commandOutput.stdout);
    if (!payload) {
      throw Object.assign(new Error(commandOutput.stderr.trim() || "macOS 语音转写没有返回结果。"), { status: 502 });
    }

    if (!payload.ok) {
      throw Object.assign(new Error(payload.error || "macOS 语音转写失败。"), { status: 502, payload });
    }

    return {
      transcript: String(payload.transcript || "").trim(),
      backend: "macos_speech_framework",
      locale,
      onDeviceOnly,
    };
  } catch (error) {
    const payload = parseMacSpeechPayload(error.stdout);
    if (payload?.error) {
      throw Object.assign(new Error(payload.error), { status: 502, payload });
    }
    throw Object.assign(new Error(humanizeMacSpeechError(error.stderr || error.message || "macOS 语音转写失败。")), { status: 502 });
  }
}

async function transcribeWithMacSpeech(wavPath) {
  if (process.platform !== "darwin") {
    throw Object.assign(new Error("当前本地语音转写只支持 macOS。"), { status: 501 });
  }

  const locale = process.env.MAC_SPEECH_LOCALE || "zh-CN";
  const preferOnDevice = process.env.MAC_SPEECH_ON_DEVICE_ONLY !== "false";
  const allowFallback = process.env.MAC_SPEECH_AUTO_FALLBACK !== "false";
  const swiftCacheDir = process.env.CLANG_MODULE_CACHE_PATH || join(tmpdir(), "fridge-agent-swift-module-cache");
  await mkdir(swiftCacheDir, { recursive: true });
  const swiftEnv = { ...process.env, CLANG_MODULE_CACHE_PATH: swiftCacheDir };
  const helperPath = await ensureMacSpeechHelper(swiftEnv);

  try {
    return await runMacSpeechHelper(wavPath, { locale, onDeviceOnly: preferOnDevice, swiftEnv, helperPath });
  } catch (error) {
    if (preferOnDevice && allowFallback && shouldRetryWithoutOnDevice(error)) {
      const fallbackResult = await runMacSpeechHelper(wavPath, { locale, onDeviceOnly: false, swiftEnv, helperPath });
      return {
        ...fallbackResult,
        fallbackFromOnDevice: true,
      };
    }
    throw error;
  }
}

function shouldRetryWithoutOnDevice(error) {
  const code = error.payload?.code;
  return code === "recognition_timeout" || code === "on_device_not_supported" || code === "recognizer_unavailable" || error.code === "TIMEOUT";
}

function humanizeMacSpeechError(message) {
  const text = String(message || "");
  if (text.includes("TCC_CRASHING_DUE_TO_PRIVACY_VIOLATION") || text.includes("NSSpeechRecognitionUsageDescription")) {
    return "macOS 隐私系统拒绝语音识别调用。请在系统设置 -> 隐私与安全性 -> 语音识别中允许启动本地服务的终端，然后重启服务。";
  }
  if (text.includes("SIGABRT") || text.includes("signal null") || text.includes("code null")) {
    return "macOS 终止了本地语音识别 helper，通常是语音识别隐私权限未授予。请在系统设置 -> 隐私与安全性 -> 语音识别中允许启动本地服务的终端，然后重启服务。";
  }
  if (text.includes("Operation not permitted")) {
    return "macOS 拒绝本地语音转写权限。请检查终端的语音识别权限后重启服务。";
  }
  return text.trim() || "macOS 语音转写失败。";
}

function parseMacSpeechPayload(stdout = "") {
  const lastLine = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    return null;
  }

  try {
    return JSON.parse(lastLine);
  } catch {
    return null;
  }
}

function getAudioTranscriptionConfig() {
  const baseUrl = normalizeBaseUrl(
    process.env.AUDIO_TRANSCRIPTION_BASE_URL
      || process.env.OPENAI_AUDIO_BASE_URL
      || process.env.OPENAI_BASE_URL
      || process.env.RIGHTCODE_BASE_URL
      || "https://api.openai.com/v1",
  );
  const apiKey = usableApiKey(process.env.AUDIO_TRANSCRIPTION_API_KEY || process.env.OPENAI_AUDIO_API_KEY || process.env.OPENAI_API_KEY) || "";
  const configuredModels = process.env.AUDIO_TRANSCRIPTION_MODELS || process.env.AUDIO_TRANSCRIPTION_MODEL || process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL || "whisper-1,gpt-4o-mini-transcribe";
  const models = uniqueList(
    configuredModels
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean)
      .concat(["whisper-1"]),
  );
  return {
    enabled: process.env.AUDIO_TRANSCRIPTION_ENABLED === "true" && Boolean(apiKey),
    apiKey,
    baseUrl,
    models,
    timeoutMs: Number(process.env.AUDIO_TRANSCRIPTION_TIMEOUT_MS || 30000),
  };
}

function uniqueList(items) {
  return [...new Set(items)];
}

function buildSpeechPrompt() {
  return [
    "请转写中文口语，输出简体中文。",
    "语音内容通常是在描述想吃的菜、做饭限制、时间预算和口味偏好。",
    "可能出现的词包括：番茄牛腩、空气炸锅、微辣、清淡、不想洗锅、只有二十分钟、今晚、明天。",
  ].join(" ");
}

async function transcribeWithAudioApi(wavPath, diagnostics) {
  const config = getAudioTranscriptionConfig();
  if (!config.enabled) {
    throw Object.assign(new Error("未配置音频转写 API Key，无法使用云端 ASR 兜底。"), { status: 502, provider: "audio_api" });
  }

  const audioBuffer = await readFile(wavPath);
  const errors = [];

  for (const model of config.models) {
    try {
      return await transcribeWithAudioApiModel({ audioBuffer, model, config, diagnostics });
    } catch (error) {
      errors.push({ model, message: error.message });
      if (error.status === 401 || error.status === 403) break;
    }
  }

  const message = errors.map((item) => `${item.model}: ${item.message}`).join("；");
  throw Object.assign(new Error(`音频转写 API 失败：${message}`), {
    status: 502,
    provider: "audio_api",
    diagnostics,
    modelErrors: errors,
  });
}

async function transcribeWithAudioApiModel({ audioBuffer, model, config, diagnostics }) {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "speech.wav");
  form.append("model", model);
  form.append("response_format", "json");
  form.append("language", process.env.AUDIO_TRANSCRIPTION_LANGUAGE || "zh");
  form.append("prompt", process.env.AUDIO_TRANSCRIPTION_PROMPT || buildSpeechPrompt());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  let responseText = "";
  try {
    response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    responseText = await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      throw Object.assign(new Error("请求超时。"), { status: 502, provider: "audio_api", diagnostics });
    }
    throw Object.assign(new Error(`请求失败：${error.message}`), { status: 502, provider: "audio_api", diagnostics });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let message = responseText.trim();
    try {
      const payload = JSON.parse(responseText);
      message = payload.error?.message || payload.message || message;
    } catch {
      // Plain-text errors are fine.
    }
    throw Object.assign(new Error(message || response.statusText), {
      status: response.status,
      provider: "audio_api",
      diagnostics,
    });
  }

  let transcript = "";
  try {
    const payload = JSON.parse(responseText);
    transcript = String(payload.text || payload.transcript || "").trim();
  } catch {
    transcript = responseText.trim();
  }

  if (!transcript) {
    throw Object.assign(new Error("没有返回文本。"), { status: 502, provider: "audio_api", diagnostics });
  }

  return {
    transcript,
    backend: "audio_transcriptions_api",
    model,
    diagnostics,
  };
}

async function transcribeWithConfiguredProviders(wavPath, diagnostics) {
  const provider = process.env.SPEECH_TRANSCRIBE_PROVIDER || "auto";
  const errors = [];
  const tencentConfig = getTencentAsrConfig();
  const audioApiConfig = getAudioTranscriptionConfig();

  async function tryProvider(name, fn) {
    try {
      return await fn();
    } catch (error) {
      errors.push({ provider: name, message: error.message, payload: error.payload || null, modelErrors: error.modelErrors || null });
      return null;
    }
  }

  if (provider === "tencent" || provider === "tencent_asr") {
    return await transcribeWithTencentAsr({
      audioBuffer: await readFile(wavPath),
      config: tencentConfig,
      diagnostics,
    });
  }

  if (provider === "audio_api") {
    return await transcribeWithAudioApi(wavPath, diagnostics);
  }

  if (provider === "macos") {
    return { ...(await transcribeWithMacSpeech(wavPath)), diagnostics };
  }

  if (tencentConfig.enabled) {
    const tencentResult = await tryProvider("tencent_asr", async () => transcribeWithTencentAsr({
      audioBuffer: await readFile(wavPath),
      config: tencentConfig,
      diagnostics,
    }));
    if (tencentResult) return tencentResult;
  }

  if (audioApiConfig.enabled) {
    const audioResult = await tryProvider("audio_api", () => transcribeWithAudioApi(wavPath, diagnostics));
    if (audioResult) return audioResult;
  }

  if (process.platform === "darwin") {
    const macResult = await tryProvider("macos", async () => ({ ...(await transcribeWithMacSpeech(wavPath)), diagnostics }));
    if (macResult) return macResult;
  }

  const mainMessage = errors.map((item) => `${item.provider}: ${item.message}`).join("；") || "没有配置可用的服务端 ASR。";
  const error = new Error(`语音转写失败。${mainMessage}`);
  error.status = errors.length ? 502 : 503;
  error.errors = errors;
  error.diagnostics = diagnostics;
  throw error;
}

async function transcribeAudioDataUrl(audioDataUrl) {
  const { mimeType, buffer } = parseDataUrl(audioDataUrl, "audio/");
  if (!buffer.length) {
    throw Object.assign(new Error("没有收到有效录音。"), { status: 400 });
  }

  const tempDir = await mkdtemp(join(tmpdir(), "fridge-agent-speech-"));
  const inputPath = join(tempDir, `input.${extensionForMimeType(mimeType)}`);
  const wavPath = join(tempDir, "speech.wav");

  try {
    await writeFile(inputPath, buffer);
    await convertAudioToWav(inputPath, wavPath);
    const diagnostics = await inspectAudio(wavPath);
    assertAudioIsUsable(diagnostics);
    return await transcribeWithConfiguredProviders(wavPath, diagnostics);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeAgentSessionId(value) {
  const sessionId = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,80}$/.test(sessionId) ? sessionId : "";
}

function normalizeAgentRequestId(value) {
  const requestId = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,80}$/.test(requestId) ? requestId : "";
}

function readBearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function mediaRunSummary(dataUrl, type) {
  const raw = String(dataUrl || "");
  const payloadLength = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1).length : 0;
  return {
    type,
    approximateBytes: Math.max(0, Math.round((payloadLength * 3) / 4)),
  };
}

function inventoryRunSummary(inventory) {
  const items = Array.isArray(inventory) ? inventory : [];
  return {
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => String(item?.category || "").trim()).filter(Boolean)).size,
  };
}

function inventoryRunContent(inventory) {
  return (Array.isArray(inventory) ? inventory : []).slice(0, 32).map((item) => ({
    name: String(item?.name || "").trim().slice(0, 80),
    category: String(item?.category || "").trim().slice(0, 40),
    quantityEstimate: String(item?.quantityEstimate || "").trim().slice(0, 80),
    state: String(item?.state || "").trim().slice(0, 80),
    notes: String(item?.notes || "").trim().slice(0, 180),
  }));
}

function userContextRunContent(userContext) {
  return {
    cookingLevel: String(userContext?.user?.cookingLevel || "").trim().slice(0, 40),
    preferences: Array.isArray(userContext?.user?.preferences) ? userContext.user.preferences.slice(0, 12) : [],
    avoid: Array.isArray(userContext?.user?.avoid) ? userContext.user.avoid.slice(0, 12) : [],
    goal: String(userContext?.user?.goal || "").trim().slice(0, 240),
    mealSlot: String(userContext?.context?.mealSlot || "").trim().slice(0, 40),
    availableCookingTime: String(userContext?.context?.availableCookingTime || "").trim().slice(0, 40),
    energyLevel: String(userContext?.context?.energyLevel || "").trim().slice(0, 40),
    pantryConfirmation: {
      availableItems: Array.isArray(userContext?.context?.pantryConfirmation?.availableItems)
        ? userContext.context.pantryConfirmation.availableItems.slice(0, 12)
        : [],
      missingItems: Array.isArray(userContext?.context?.pantryConfirmation?.missingItems)
        ? userContext.context.pantryConfirmation.missingItems.slice(0, 12)
        : [],
    },
  };
}

function dinnerPlanRunSummary(plan) {
  return {
    decision: String(plan?.decision || "").slice(0, 80),
    stepCount: Array.isArray(plan?.baseMeal?.steps) ? plan.baseMeal.steps.length : 0,
    missingItemCount: Array.isArray(plan?.shoppingUpgrade?.neededItems) ? plan.shoppingUpgrade.neededItems.length : 0,
  };
}

function targetPlanRunSummary(plan) {
  return {
    planningMode: String(plan?.planContext?.planningMode || "").slice(0, 40),
    inventoryStatus: String(plan?.planContext?.inventoryStatus || "").slice(0, 40),
    primaryAction: String(plan?.verdict?.primaryAction || "").slice(0, 80),
    standardIngredientCount: Array.isArray(plan?.standardIngredients) ? plan.standardIngredients.length : 0,
    stepCount: Array.isArray(plan?.executionPlan?.steps) ? plan.executionPlan.steps.length : 0,
    missingCriticalCount: Array.isArray(plan?.inventoryMatch?.missingCritical) ? plan.inventoryMatch.missingCritical.length : 0,
    mustBuyCount: Array.isArray(plan?.shoppingPlan?.mustBuy) ? plan.shoppingPlan.mustBuy.length : 0,
  };
}

function errorRunObservation(error) {
  return {
    source: error?.code === "MODEL_TIMEOUT" ? "model-timeout" : "request-error",
    error: {
      code: error?.code || null,
      name: error?.name || "Error",
    },
  };
}

const server = createServer(async (req, res) => {
  const requestId = normalizeAgentRequestId(req.headers["x-agent-request-id"]) || randomUUID();
  const startedAt = performance.now();
  const pathname = requestPath(req);
  const sessionId = normalizeAgentSessionId(req.headers["x-agent-session-id"]);
  let runObservation = {};
  let requestFinalized = false;
  res.setHeader("x-request-id", requestId);
  setSecurityHeaders(res);
  const finalizeRequest = ({ disconnected = false } = {}) => {
    if (requestFinalized) return;
    requestFinalized = true;
    if (!req.url?.startsWith("/api/")) return;
    const durationMs = Math.round(performance.now() - startedAt);
    const status = disconnected ? 499 : res.statusCode;
    const observation = disconnected
      ? {
          ...runObservation,
          source: "client-disconnect",
          error: { code: "CLIENT_DISCONNECTED", name: "ClientDisconnect" },
        }
      : runObservation;
    console.log(JSON.stringify({
      type: "api_request",
      requestId,
      method: req.method,
      path: pathname,
      status,
      durationMs,
    }));
    if (agentRunStore.shouldTrack(pathname)) {
      void agentRunStore.record({
        requestId,
        sessionId,
        route: pathname,
        method: req.method,
        status,
        durationMs,
        ...observation,
      });
    }
  };
  res.on("finish", () => finalizeRequest());
  res.on("close", () => {
    if (!res.writableFinished) finalizeRequest({ disconnected: true });
  });

  try {
    if (!consumeRateLimit(req, res, pathname)) return;

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, healthPayload());
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/admin/agent-runs") {
      if (!agentRunStore.health().adminApiEnabled) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      if (!agentRunStore.isAdminAuthorized(readBearerToken(req))) {
        res.setHeader("cache-control", "no-store");
        sendJson(res, 401, { error: "管理员令牌无效。" });
        return;
      }
      res.setHeader("cache-control", "no-store");
      if (req.method === "GET") {
        const runs = await agentRunStore.list({ limit: url.searchParams.get("limit") || 50 });
        sendJson(res, 200, { health: agentRunStore.health(), runs });
        return;
      }
      if (req.method === "DELETE") {
        const scope = url.searchParams.get("scope") || "expired";
        if (scope === "all" && url.searchParams.get("confirm") !== "clear") {
          sendJson(res, 400, { error: "清空全部记录需要 confirm=clear。" });
          return;
        }
        const result = await agentRunStore.clear({ scope });
        sendJson(res, 200, { ok: true, scope, ...result, health: agentRunStore.health() });
        return;
      }
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/sliced/")) {
      await serveSlicedAsset(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/demo-assets/")) {
      const assetPath = decodeURIComponent(url.pathname.slice("/demo-assets".length));
      const filePath = await resolveStaticFile(demoAssetsRoot, assetPath, false);
      if (!filePath) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      await sendStaticFile(res, filePath, true);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      if (isProduction) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, { users: await userMemoryStore.listUsers() });
      return;
    }

    const userStateMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (req.method === "GET" && userStateMatch) {
      if (isProduction) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, await userMemoryStore.getUserState(userStateMatch[1]));
      return;
    }

    const feedbackMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/feedback$/);
    if (req.method === "POST" && feedbackMatch) {
      const body = await readJsonBody(req);
      const userState = await userMemoryStore.recordFeedback(feedbackMatch[1], body);
      sendJson(res, 200, isProduction ? { ok: true } : userState);
      return;
    }

    const visionCacheMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/vision-cache$/);
    if (req.method === "GET" && visionCacheMatch) {
      if (isProduction) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, { cache: await userMemoryStore.getVisionCache(visionCacheMatch[1]) });
      return;
    }

    if (req.method === "POST" && visionCacheMatch) {
      if (isProduction) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
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
      runObservation = {
        agent: "fridgeVisionAgent",
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        inputSummary: { media: mediaRunSummary(body.imageDataUrl, "image") },
      };
      const visionStartedAt = performance.now();
      const outcome = await demoVisionCache.race(
        "fridge",
        { imageDataUrl: body.imageDataUrl, demoKey: body.demoKey },
        () => analyzeFridge(body.imageDataUrl, modelClients.vision, { analysisMode: body.analysisMode }),
      );
      const visionMs = performance.now() - visionStartedAt;
      const modelMeta = readModelResponseMeta(outcome.result);
      const sanitized = sanitizeFridgeVision(outcome.result);
      runObservation = {
        ...runObservation,
        source: outcome.source,
        usage: modelMeta?.usage || null,
        trace: { totalMs: Math.round(visionMs), inventorySanitization: sanitized.diagnostics },
        outputSummary: {
          confirmedItemCount: sanitized.vision.items.length,
          uncertainItemCount: sanitized.vision.uncertainItems.length,
          warningCount: sanitized.vision.warnings.length,
        },
        content: {
          input: { media: mediaRunSummary(body.imageDataUrl, "image") },
          output: { vision: sanitized.vision },
        },
      };
      setServerTiming(res, { vision: visionMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        agent: "fridgeVisionAgent",
        source: outcome.source,
        cache: outcome.cache || null,
        modelError: outcome.modelError || null,
        usage: modelMeta?.usage || null,
        vision: sanitized.vision,
        trace: {
          totalMs: Math.round(visionMs),
          source: outcome.source,
          inventorySanitization: sanitized.diagnostics,
        },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze-target-dish") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传目标菜图片 data URL。" });
        return;
      }
      runObservation = {
        agent: "targetDishVisionAgent",
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        inputSummary: { media: mediaRunSummary(body.imageDataUrl, "image") },
      };
      const visionStartedAt = performance.now();
      const outcome = await demoVisionCache.race(
        "targetDish",
        { imageDataUrl: body.imageDataUrl, demoKey: body.demoKey },
        () => analyzeTargetDish(body.imageDataUrl, modelClients.vision),
      );
      const visionMs = performance.now() - visionStartedAt;
      const modelMeta = readModelResponseMeta(outcome.result);
      // 模型、旧运行时缓存与固定示例都在 API 边界收敛到同一候选详情契约。
      const targetVision = normalizeTargetDishVisionContract(outcome.result);
      runObservation = {
        ...runObservation,
        source: outcome.source,
        usage: modelMeta?.usage || null,
        trace: { totalMs: Math.round(visionMs) },
        outputSummary: {
          dishOptionCount: targetVision.dishOptions.length,
          likelyIngredientCount: Array.isArray(targetVision.likelyIngredients) ? targetVision.likelyIngredients.length : 0,
          toolCount: Array.isArray(targetVision.requiredTools) ? targetVision.requiredTools.length : 0,
          warningCount: Array.isArray(targetVision.warnings) ? targetVision.warnings.length : 0,
        },
        content: {
          input: { media: mediaRunSummary(body.imageDataUrl, "image") },
          output: { targetVision },
        },
      };
      setServerTiming(res, { vision: visionMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        agent: "targetDishVisionAgent",
        source: outcome.source,
        cache: outcome.cache || null,
        modelError: outcome.modelError || null,
        usage: modelMeta?.usage || null,
        targetVision,
        trace: { totalMs: Math.round(visionMs), source: outcome.source },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/generate-life-log") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传成品图片 data URL。" });
        return;
      }
      runObservation = {
        agent: "lifeLogDraftAgent",
        provider: modelConfig.provider,
        model: modelRoutes.lifeLog.model,
        inputSummary: { media: mediaRunSummary(body.imageDataUrl, "image") },
      };
      const draftStartedAt = performance.now();
      const outcome = await demoVisionCache.race(
        "lifeLog",
        {
          imageDataUrl: body.imageDataUrl,
          sourceFileName: body.sourceFileName,
          demoKey: body.demoKey,
          mealContext: body.mealContext || {},
        },
        () => generateLifeLogDraft({
          imageDataUrl: body.imageDataUrl,
          mealContext: body.mealContext || {},
        }, modelClients.lifeLog),
      );
      const draftMs = performance.now() - draftStartedAt;
      const modelMeta = readModelResponseMeta(outcome.result);
      runObservation = {
        ...runObservation,
        source: outcome.source,
        usage: modelMeta?.usage || null,
        trace: { totalMs: Math.round(draftMs) },
        outputSummary: {
          titleCount: Array.isArray(outcome.result?.titleOptions) ? outcome.result.titleOptions.length : 0,
          shotCount: Array.isArray(outcome.result?.suggestedShots) ? outcome.result.suggestedShots.length : 0,
          tagCount: Array.isArray(outcome.result?.tags) ? outcome.result.tags.length : 0,
        },
        content: {
          input: {
            media: mediaRunSummary(body.imageDataUrl, "image"),
            mealName: String(body.mealContext?.mealName || "").trim().slice(0, 100),
          },
          output: { lifeLog: outcome.result },
        },
      };
      setServerTiming(res, { draft: draftMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.lifeLog.model,
        agent: "lifeLogDraftAgent",
        source: outcome.source,
        cache: outcome.cache || null,
        modelError: outcome.modelError || null,
        usage: modelMeta?.usage || null,
        lifeLog: outcome.result,
        trace: { totalMs: Math.round(draftMs), source: outcome.source },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/rescue-dish") {
      const body = await readJsonBody(req);
      const allowedCategories = new Set(["state", "taste", "seasoning", "next_step"]);
      const followUp = Number(body.followUp?.round) === 2
        ? {
            round: 2,
            outcome: body.followUp?.outcome === "not_improved" ? "not_improved" : "recheck",
            previousHeadline: body.followUp?.previousHeadline,
            previousAction: body.followUp?.previousAction,
            previousCheck: body.followUp?.previousCheck,
          }
        : null;
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传当前做菜画面 data URL。" });
        return;
      }
      if (!allowedCategories.has(body.category) || !String(body.symptom || "").trim()) {
        sendJson(res, 400, { error: "请选择问题类别和具体情况。" });
        return;
      }
      runObservation = {
        agent: "dishRescueAgent",
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        inputSummary: {
          media: mediaRunSummary(body.imageDataUrl, "image"),
          category: body.category,
          followUpRound: followUp?.round || 1,
        },
      };
      const rescueStartedAt = performance.now();
      let dishRescue;
      let source = "model";
      let cache = null;
      let modelError = null;
      try {
        const outcome = await demoVisionCache.race(
          "dishRescue",
          {
            imageDataUrl: body.imageDataUrl,
            sourceFileName: body.sourceFileName,
            demoKey: body.demoKey,
            category: body.category,
            symptom: body.symptom,
            requestSignature: [
              body.category,
              body.symptom,
              followUp ? "round2" : "",
              followUp?.outcome || "",
            ].filter(Boolean).join("|"),
          },
          () => rescueDish({
            imageDataUrl: body.imageDataUrl,
            category: body.category,
            symptom: body.symptom,
            description: body.description,
            dishContext: body.dishContext || {},
            followUp,
          }, modelClients.vision),
        );
        dishRescue = enforceDishRescueBoundaries(outcome.result, body);
        source = outcome.source;
        cache = outcome.cache || null;
        modelError = outcome.modelError || null;
      } catch (error) {
        source = "rules-fallback";
        modelError = isProduction ? null : error.message;
        dishRescue = enforceDishRescueBoundaries(buildDishRescueFallback({ ...body, followUp }), body);
      }
      const rescueMs = performance.now() - rescueStartedAt;
      const modelMeta = source === "model" ? readModelResponseMeta(dishRescue) : null;
      runObservation = {
        ...runObservation,
        source,
        usage: modelMeta?.usage || null,
        trace: { totalMs: Math.round(rescueMs) },
        outputSummary: {
          actionCount: Array.isArray(dishRescue?.actions) ? dishRescue.actions.length : 0,
          observationCount: Array.isArray(dishRescue?.visualObservations) ? dishRescue.visualObservations.length : 0,
          followUpRequired: Boolean(dishRescue?.followUp?.required),
        },
        content: {
          input: {
            media: mediaRunSummary(body.imageDataUrl, "image"),
            category: body.category,
            symptom: String(body.symptom || "").trim().slice(0, 100),
            followUp,
          },
          output: { dishRescue },
        },
      };
      setServerTiming(res, { rescue: rescueMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.vision.model,
        agent: "dishRescueAgent",
        source,
        cache,
        modelError,
        usage: modelMeta?.usage || null,
        dishRescue,
        trace: { totalMs: Math.round(rescueMs), source },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe-audio") {
      const body = await readJsonBody(req);
      if (!body.audioDataUrl?.startsWith("data:audio/")) {
        sendJson(res, 400, { error: "请上传音频 data URL。" });
        return;
      }
      runObservation = {
        agent: "localSpeechInputAgent",
        inputSummary: { media: mediaRunSummary(body.audioDataUrl, "audio") },
      };
      const speechStartedAt = performance.now();
      const speech = await transcribeAudioDataUrl(body.audioDataUrl);
      const speechMs = performance.now() - speechStartedAt;
      runObservation = {
        ...runObservation,
        source: speech.backend || speech.provider || "speech-provider",
        trace: { totalMs: Math.round(speechMs) },
        outputSummary: {
          transcriptLength: String(speech.transcript || "").length,
          locale: speech.locale || null,
        },
        content: {
          input: { media: mediaRunSummary(body.audioDataUrl, "audio") },
          output: {
            backend: speech.backend || speech.provider || null,
            locale: speech.locale || null,
            transcriptLength: String(speech.transcript || "").length,
          },
        },
      };
      setServerTiming(res, { speech: speechMs });
      sendJson(res, 200, { agent: "localSpeechInputAgent", ...speech, trace: { totalMs: Math.round(speechMs) } });
      return;
    }

    if (req.method === "POST" && req.url === "/api/case-retrieval/preview") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext) {
        sendJson(res, 400, { error: "缺少 inventory 或 userContext。" });
        return;
      }
      runObservation = {
        agent: "caseRetriever",
        source: "structured-local-retrieval",
        inputSummary: {
          ...inventoryRunSummary(body.inventory),
          hasTargetDish: Boolean(body.targetDish?.text?.trim()),
        },
      };
      const retrievalStartedAt = performance.now();
      const retrieval = await caseRetriever.retrieve(
        {
          route: body.targetDish?.text?.trim() ? "feed_to_fridge" : "fridge_first",
          inventory: body.inventory,
          targetDish: body.targetDish || null,
          userContext: body.userContext,
        },
        { mode: requestRetrievalMode(body, "contrast"), limit: body.limit || caseRetrievalConfig.limit },
      );
      const retrievalMs = performance.now() - retrievalStartedAt;
      runObservation = {
        ...runObservation,
        trace: { retrievalMs: Math.round(retrievalMs) },
        outputSummary: {
          mode: retrieval?.mode || null,
          resultCount: Array.isArray(retrieval?.items) ? retrieval.items.length : Array.isArray(retrieval?.cases) ? retrieval.cases.length : 0,
        },
        content: {
          input: {
            inventory: inventoryRunContent(body.inventory),
            userContext: userContextRunContent(body.userContext),
            targetDish: body.targetDish?.text ? { text: String(body.targetDish.text).slice(0, 200) } : null,
          },
          output: { retrieval },
        },
      };
      setServerTiming(res, { retrieval: retrievalMs });
      sendJson(res, 200, { retrieval, trace: { retrievalMs: Math.round(retrievalMs) } });
      return;
    }

    if (req.method === "POST" && req.url === "/api/ingredient-substitution") {
      const body = await readJsonBody(req);
      if (!body.targetIngredient?.trim() || !Array.isArray(body.inventory)) {
        sendJson(res, 400, { error: "缺少 targetIngredient 或用户确认后的 inventory。" });
        return;
      }
      runObservation = {
        agent: "ingredientSubstitutionEngine",
        source: "confirmed-inventory-rules",
        inputSummary: inventoryRunSummary(body.inventory),
      };
      const matchingStartedAt = performance.now();
      const match = matchIngredientSubstitutes({
        targetIngredient: body.targetIngredient,
        inventory: body.inventory,
        targetDish: body.targetDish || "",
      });
      const matchingMs = performance.now() - matchingStartedAt;
      runObservation = {
        ...runObservation,
        trace: { matchingMs: Math.round(matchingMs) },
        outputSummary: { status: match?.status || match?.type || null },
        content: {
          input: {
            targetIngredient: String(body.targetIngredient || "").slice(0, 100),
            targetDish: String(body.targetDish || "").slice(0, 120),
            inventory: inventoryRunContent(body.inventory),
          },
          output: { match },
        },
      };
      setServerTiming(res, { matching: matchingMs });
      sendJson(res, 200, {
        agent: "ingredientSubstitutionEngine",
        source: "confirmed-inventory-rules",
        match,
        trace: { matchingMs: Math.round(matchingMs) },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/eat-first") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.itemStates)) {
        sendJson(res, 400, { error: "缺少用户确认后的 itemStates。" });
        return;
      }
      runObservation = {
        agent: "eatFirstEngine",
        source: "user-confirmed-status-rules",
        inputSummary: { itemStateCount: body.itemStates.length },
      };
      const rankingStartedAt = performance.now();
      const eatFirst = buildEatFirstList({ itemStates: body.itemStates });
      const rankingMs = performance.now() - rankingStartedAt;
      runObservation = {
        ...runObservation,
        trace: { rankingMs: Math.round(rankingMs) },
        outputSummary: {
          tonightCount: Array.isArray(eatFirst?.tonightPriority) ? eatFirst.tonightPriority.length : 0,
          soonCount: Array.isArray(eatFirst?.soonPriority) ? eatFirst.soonPriority.length : 0,
          confirmationCount: Array.isArray(eatFirst?.needsConfirmation) ? eatFirst.needsConfirmation.length : 0,
        },
        content: {
          input: { itemStates: body.itemStates },
          output: { eatFirst },
        },
      };
      setServerTiming(res, { ranking: rankingMs });
      sendJson(res, 200, {
        agent: "eatFirstEngine",
        source: "user-confirmed-status-rules",
        eatFirst,
        trace: { rankingMs: Math.round(rankingMs) },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/fridge-organization") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory)) {
        sendJson(res, 400, { error: "缺少用户确认后的 inventory。" });
        return;
      }
      runObservation = {
        agent: "fridgeZoneEngine",
        source: "coarse-zone-confirmed-rules",
        inputSummary: inventoryRunSummary(body.inventory),
      };
      const organizationStartedAt = performance.now();
      const organization = buildFridgeOrganization({
        inventory: body.inventory,
        itemStates: body.itemStates,
        storageConfirmations: body.storageConfirmations,
      });
      const organizationMs = performance.now() - organizationStartedAt;
      runObservation = {
        ...runObservation,
        trace: { organizationMs: Math.round(organizationMs) },
        outputSummary: {
          suggestionCount: Array.isArray(organization?.suggestions) ? organization.suggestions.length : 0,
          zoneCount: Array.isArray(organization?.currentLayout) ? organization.currentLayout.length : 0,
        },
        content: {
          input: {
            inventory: inventoryRunContent(body.inventory),
            itemStates: body.itemStates,
            storageConfirmations: body.storageConfirmations,
          },
          output: { organization },
        },
      };
      setServerTiming(res, { organization: organizationMs });
      sendJson(res, 200, {
        agent: "fridgeZoneEngine",
        source: "coarse-zone-confirmed-rules",
        organization,
        trace: { organizationMs: Math.round(organizationMs) },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/plan-dinner") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext) {
        sendJson(res, 400, { error: "缺少 inventory 或 userContext。" });
        return;
      }
      runObservation = {
        agent: "dinnerPlannerAgent",
        provider: modelConfig.provider,
        model: modelRoutes.planning.model,
        inputSummary: inventoryRunSummary(body.inventory),
      };
      const retrievalStartedAt = performance.now();
      const retrieval = await caseRetriever.retrieve(
        { route: "fridge_first", inventory: body.inventory, userContext: body.userContext },
        { mode: requestRetrievalMode(body), limit: caseRetrievalConfig.limit },
      );
      const retrievalMs = performance.now() - retrievalStartedAt;
      const planningStartedAt = performance.now();
      const plan = await planDinner(
        { inventory: body.inventory, userContext: body.userContext, retrievedCases: toPlannerCases(retrieval) },
        modelClients.planning,
      );
      const planningMs = performance.now() - planningStartedAt;
      const modelMeta = readModelResponseMeta(plan);
      runObservation = {
        ...runObservation,
        source: "model",
        usage: modelMeta?.usage || null,
        trace: { retrievalMs: Math.round(retrievalMs), planningMs: Math.round(planningMs), totalMs: Math.round(retrievalMs + planningMs) },
        outputSummary: dinnerPlanRunSummary(plan),
        content: {
          input: {
            inventory: inventoryRunContent(body.inventory),
            userContext: userContextRunContent(body.userContext),
            retrievalMode: retrieval?.mode || caseRetrievalConfig.mode,
          },
          output: { plan, retrieval },
        },
      };
      setServerTiming(res, { retrieval: retrievalMs, planning: planningMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.planning.model,
        agent: "dinnerPlannerAgent",
        source: "model",
        plan,
        usage: modelMeta?.usage || null,
        retrieval,
        trace: { retrievalMs: Math.round(retrievalMs), planningMs: Math.round(planningMs), totalMs: Math.round(retrievalMs + planningMs) },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/plan-target-dish") {
      const body = await readJsonBody(req);
      if (!body.userContext || !body.targetDish?.text?.trim()) {
        sendJson(res, 400, { error: "缺少 targetDish.text 或 userContext。", requestId });
        return;
      }
      const planningContext = normalizeTargetDishPlanningRequest({
        planningMode: body.planningMode,
        inventoryStatus: body.inventoryStatus,
        inventory: body.inventory,
      });
      runObservation = {
        agent: "targetDishPlannerAgent",
        provider: modelConfig.provider,
        model: modelRoutes.planning.model,
        inputSummary: {
          ...inventoryRunSummary(planningContext.inventory),
          planningMode: planningContext.planningMode,
          inventoryStatus: planningContext.inventoryStatus,
          hasTargetDish: true,
          simulatedShoppingItemCount: Array.isArray(body.targetDish?.shoppingDecision?.acceptedItems)
            ? body.targetDish.shoppingDecision.acceptedItems.length
            : 0,
        },
      };
      const targetDish = {
        text: body.targetDish.text.trim(),
        intentTime: body.targetDish.intentTime || "tonight",
        nameSource: String(body.targetDish.nameSource || body.targetDish.inputSource || "unknown").slice(0, 40),
        nameConfirmed: body.targetDish.nameConfirmed !== false,
        inputSource: String(body.targetDish.inputSource || body.targetDish.nameSource || "unknown").slice(0, 40),
        imageAnalysis: body.targetDish.imageAnalysis || null,
        shoppingDecision: planningContext.planningMode === "inventory_adapted"
          && Array.isArray(body.targetDish.shoppingDecision?.acceptedItems)
          ? {
              mode: "simulate_after_purchase",
              acceptedItems: body.targetDish.shoppingDecision.acceptedItems
                .map((item) => String(item || "").trim().slice(0, 40))
                .filter(Boolean)
                .slice(0, 8),
            }
          : null,
      };
      const retrievalStartedAt = performance.now();
      const requestedRetrievalMode = requestRetrievalMode(body);
      const retrieval = planningContext.planningMode === "standard_recipe"
        ? {
            mode: "off",
            requestedMode: requestedRetrievalMode,
            query: null,
            cases: [],
            skippedReason: "inventory_not_checked",
          }
        : await caseRetriever.retrieve(
          { route: "feed_to_fridge", inventory: planningContext.inventory, targetDish, userContext: body.userContext },
          { mode: requestedRetrievalMode, limit: caseRetrievalConfig.limit },
        );
      const retrievalMs = performance.now() - retrievalStartedAt;
      const planningStartedAt = performance.now();
      const targetPlan = await planTargetDish(
        {
          planningMode: planningContext.planningMode,
          inventoryStatus: planningContext.inventoryStatus,
          inventory: planningContext.inventory,
          targetDish,
          userContext: body.userContext,
          retrievedCases: toPlannerCases(retrieval),
        },
        modelClients.planning,
      );
      const planningMs = performance.now() - planningStartedAt;
      const modelMeta = readModelResponseMeta(targetPlan);
      runObservation = {
        ...runObservation,
        source: "model",
        usage: modelMeta?.usage || null,
        trace: { retrievalMs: Math.round(retrievalMs), planningMs: Math.round(planningMs), totalMs: Math.round(retrievalMs + planningMs) },
        outputSummary: targetPlanRunSummary(targetPlan),
        content: {
          input: {
            planContext: {
              planningMode: planningContext.planningMode,
              inventoryStatus: planningContext.inventoryStatus,
            },
            inventory: planningContext.inventoryStatus === "not_checked"
              ? null
              : inventoryRunContent(planningContext.inventory),
            userContext: userContextRunContent(body.userContext),
            targetDish: {
              text: targetDish.text.slice(0, 240),
              intentTime: targetDish.intentTime,
              imageAnalysis: targetDish.imageAnalysis,
              shoppingDecision: targetDish.shoppingDecision,
            },
            retrievalMode: retrieval?.mode || caseRetrievalConfig.mode,
          },
          output: { targetPlan, retrieval },
        },
      };
      setServerTiming(res, { retrieval: retrievalMs, planning: planningMs });
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelRoutes.planning.model,
        agent: "targetDishPlannerAgent",
        source: "model",
        requestId,
        targetPlan,
        usage: modelMeta?.usage || null,
        retrieval,
        trace: { retrievalMs: Math.round(retrievalMs), planningMs: Math.round(planningMs), totalMs: Math.round(retrievalMs + planningMs) },
      });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    runObservation = { ...runObservation, ...errorRunObservation(error) };
    const { status, payload } = publicErrorPayload(error, requestId, requestPath(req));
    if (status >= 500) {
      console.error(JSON.stringify({
        type: "api_error",
        requestId,
        path: requestPath(req),
        status,
        code: error.code || null,
        name: error.name || "Error",
      }));
    }
    sendJson(res, status, payload);
  }
});

server.listen(port, host, () => {
  console.log(`冰箱晚餐 Agent demo: http://${host}:${port}/`);
  console.log(`Static frontend: ${isProduction ? "frontend/dist" : "frontend/dist when present, otherwise demo"}`);
  console.log(`Agent runtime: lightweight-node-agent`);
  console.log(`Model provider: ${modelConfig.provider}`);
  if (!isProduction) {
    console.log(`Responses endpoint: ${modelConfig.responsesBaseUrl}`);
    console.log(`Chat endpoint: ${modelConfig.chatBaseUrl}`);
  }
  if (modelConfig.apiKey) {
    console.log(`Model routing: vision=${modelRoutes.vision.model}, planning=${modelRoutes.planning.model}, lifeLog=${modelRoutes.lifeLog.model}`);
  } else {
    console.log("未设置 OPENAI_API_KEY，将使用前端缓存兜底。");
  }
});
