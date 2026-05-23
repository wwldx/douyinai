import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "./agent/modelClient.mjs";
import { analyzeFridge } from "./agent/fridgeVisionAgent.mjs";
import { analyzeTargetDish } from "./agent/targetDishVisionAgent.mjs";
import { planDinner } from "./agent/dinnerPlannerAgent.mjs";
import { planTargetDish } from "./agent/targetDishPlannerAgent.mjs";
import { createUserMemoryStore } from "./agent/userMemoryStore.mjs";
import { createDemoVisionCache } from "./agent/demoVisionCache.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const dataRoot = fileURLToPath(new URL("../data", import.meta.url));
const macSpeechScriptPath = fileURLToPath(new URL("../scripts/mac-speech-transcribe.swift", import.meta.url));
const macSpeechInfoPlistPath = fileURLToPath(new URL("../scripts/mac-speech-transcribe.Info.plist", import.meta.url));
const macSpeechBinaryPath = fileURLToPath(new URL("../build/mac-speech-transcribe", import.meta.url));

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
const demoVisionCache = createDemoVisionCache(dataRoot);
let macSpeechHelperBuildPromise = null;

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
      throw new Error("请求体过大，请压缩图片或缩短录音后重试。");
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
  return {
    ok: true,
    provider: modelConfig.provider,
    responsesBaseUrl: modelConfig.responsesBaseUrl,
    chatBaseUrl: modelConfig.chatBaseUrl,
    model: modelConfig.model,
    hasApiKey: Boolean(modelConfig.apiKey),
    disableResponseStorage: modelConfig.disableResponseStorage,
    agentRuntime: "lightweight-node-agent",
    agents: ["fridgeVisionAgent", "targetDishVisionAgent", "dinnerPlannerAgent", "targetDishPlannerAgent", "localSpeechInputAgent"],
    demoVisionCache: {
      enabled: demoVisionCache.enabled,
      fallbackMs: demoVisionCache.fallbackMs,
    },
    speech: {
      provider: speechProvider,
      audioApiEnabled: audioApiConfig.enabled,
      audioApiBaseUrl: audioApiConfig.enabled ? audioApiConfig.baseUrl : null,
      audioApiModels: audioApiConfig.enabled ? audioApiConfig.models : [],
      macBackend: "macos_speech_framework",
      locale: process.env.MAC_SPEECH_LOCALE || "zh-CN",
      onDeviceOnly: process.env.MAC_SPEECH_ON_DEVICE_ONLY !== "false",
      autoFallback: process.env.MAC_SPEECH_AUTO_FALLBACK !== "false",
      requires: ["ffmpeg", "optional swift", "optional macOS Speech recognition permission", "optional audio transcriptions API"],
    },
  };
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
  const apiKey = process.env.AUDIO_TRANSCRIPTION_API_KEY || process.env.OPENAI_AUDIO_API_KEY || process.env.OPENAI_API_KEY || "";
  const configuredModels = process.env.AUDIO_TRANSCRIPTION_MODELS || process.env.AUDIO_TRANSCRIPTION_MODEL || process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL || "whisper-1,gpt-4o-mini-transcribe";
  const models = uniqueList(
    configuredModels
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean)
      .concat(["whisper-1"]),
  );
  return {
    enabled: process.env.AUDIO_TRANSCRIPTION_ENABLED !== "false" && Boolean(apiKey),
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

  async function tryProvider(name, fn) {
    try {
      return await fn();
    } catch (error) {
      errors.push({ provider: name, message: error.message, payload: error.payload || null, modelErrors: error.modelErrors || null });
      return null;
    }
  }

  if (provider === "audio_api") {
    return await transcribeWithAudioApi(wavPath, diagnostics);
  }

  if (provider === "macos") {
    return { ...(await transcribeWithMacSpeech(wavPath)), diagnostics };
  }

  const audioResult = await tryProvider("audio_api", () => transcribeWithAudioApi(wavPath, diagnostics));
  if (audioResult) return audioResult;

  const macResult = await tryProvider("macos", async () => ({ ...(await transcribeWithMacSpeech(wavPath)), diagnostics }));
  if (macResult) return macResult;

  const mainMessage = errors.map((item) => `${item.provider}: ${item.message}`).join("；");
  const error = new Error(`语音转写失败。${mainMessage}`);
  error.status = 502;
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

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, healthPayload());
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname.startsWith("/sliced/")) {
      await serveSlicedAsset(req, res);
      return;
    }

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
      const outcome = await demoVisionCache.race(
        "fridge",
        { imageDataUrl: body.imageDataUrl, sourceFileName: body.sourceFileName },
        () => analyzeFridge(body.imageDataUrl, modelClient),
      );
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelConfig.model,
        agent: "fridgeVisionAgent",
        source: outcome.source,
        cache: outcome.cache || null,
        modelError: outcome.modelError || null,
        vision: outcome.result,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze-target-dish") {
      const body = await readJsonBody(req);
      if (!body.imageDataUrl?.startsWith("data:image/")) {
        sendJson(res, 400, { error: "请上传目标菜图片 data URL。" });
        return;
      }
      const outcome = await demoVisionCache.race(
        "targetDish",
        { imageDataUrl: body.imageDataUrl, sourceFileName: body.sourceFileName },
        () => analyzeTargetDish(body.imageDataUrl, modelClient),
      );
      sendJson(res, 200, {
        provider: modelConfig.provider,
        model: modelConfig.model,
        agent: "targetDishVisionAgent",
        source: outcome.source,
        cache: outcome.cache || null,
        modelError: outcome.modelError || null,
        targetVision: outcome.result,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe-audio") {
      const body = await readJsonBody(req);
      if (!body.audioDataUrl?.startsWith("data:audio/")) {
        sendJson(res, 400, { error: "请上传音频 data URL。" });
        return;
      }
      const speech = await transcribeAudioDataUrl(body.audioDataUrl);
      sendJson(res, 200, { agent: "localSpeechInputAgent", ...speech });
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

    if (req.method === "POST" && req.url === "/api/plan-target-dish") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.inventory) || !body.userContext || !body.targetDish?.text?.trim()) {
        sendJson(res, 400, { error: "缺少 inventory、targetDish.text 或 userContext。" });
        return;
      }
      const targetPlan = await planTargetDish(
        {
          inventory: body.inventory,
          targetDish: {
            text: body.targetDish.text.trim(),
            intentTime: body.targetDish.intentTime || "tonight",
            imageAnalysis: body.targetDish.imageAnalysis || null,
          },
          userContext: body.userContext,
        },
        modelClient,
      );
      sendJson(res, 200, { provider: modelConfig.provider, model: modelConfig.model, agent: "targetDishPlannerAgent", targetPlan });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const payload = { error: error.message || "Server error" };
    if (error.diagnostics) payload.diagnostics = error.diagnostics;
    if (error.errors) payload.errors = error.errors;
    sendJson(res, error.status || 500, payload);
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
