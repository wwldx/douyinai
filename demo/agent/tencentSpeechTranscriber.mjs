import { createHash, createHmac } from "node:crypto";

const DEFAULT_HOST = "asr.tencentcloudapi.com";
const DEFAULT_ACTION = "SentenceRecognition";
const DEFAULT_VERSION = "2019-06-14";
const DEFAULT_CONTENT_TYPE = "application/json; charset=utf-8";
const DEFAULT_HOTWORDS = [
  "番茄牛腩|8",
  "黄焖鸡|8",
  "空气炸锅|8",
  "少洗锅|8",
  "微辣|6",
  "清淡|6",
].join(",");

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function utcDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value) {
  return String(value || "").trim();
}

export function createTc3Authorization({
  secretId,
  secretKey,
  service,
  host,
  action,
  payload,
  timestamp,
  contentType = DEFAULT_CONTENT_TYPE,
}) {
  const requestTimestamp = Number(timestamp);
  if (!nonEmpty(secretId) || !nonEmpty(secretKey)) {
    throw Object.assign(new Error("腾讯云 ASR SecretId 或 SecretKey 未配置。"), {
      status: 503,
      code: "TENCENT_ASR_NOT_CONFIGURED",
      provider: "tencent_asr",
    });
  }
  if (!Number.isInteger(requestTimestamp) || requestTimestamp <= 0) {
    throw new TypeError("TC3 timestamp 必须是正整数秒级时间戳。");
  }

  const date = utcDate(requestTimestamp);
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalHeaders = [
    `content-type:${contentType.toLowerCase().trim()}`,
    `host:${host.toLowerCase().trim()}`,
    `x-tc-action:${action.toLowerCase().trim()}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(requestTimestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");
  const authorization = [
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    authorization,
    canonicalRequest,
    credentialScope,
    date,
    signature,
    signedHeaders,
    stringToSign,
  };
}

export function getTencentAsrConfig(env = process.env) {
  const secretId = nonEmpty(env.TENCENTCLOUD_SECRET_ID || env.TENCENT_ASR_SECRET_ID);
  const secretKey = nonEmpty(env.TENCENTCLOUD_SECRET_KEY || env.TENCENT_ASR_SECRET_KEY);
  return {
    enabled: env.TENCENT_ASR_ENABLED !== "false" && Boolean(secretId && secretKey),
    secretId,
    secretKey,
    token: nonEmpty(env.TENCENTCLOUD_SESSION_TOKEN || env.TENCENTCLOUD_TOKEN),
    endpoint: nonEmpty(env.TENCENT_ASR_ENDPOINT) || `https://${DEFAULT_HOST}`,
    host: DEFAULT_HOST,
    region: nonEmpty(env.TENCENT_ASR_REGION),
    engineType: nonEmpty(env.TENCENT_ASR_ENGINE_TYPE) || "16k_zh",
    hotwordList: nonEmpty(env.TENCENT_ASR_HOTWORD_LIST) || DEFAULT_HOTWORDS,
    timeoutMs: positiveInteger(env.TENCENT_ASR_TIMEOUT_MS, 20000),
  };
}

export function buildTencentAsrRequest({
  audioBuffer,
  secretId,
  secretKey,
  token = "",
  timestamp = Math.floor(Date.now() / 1000),
  endpoint = `https://${DEFAULT_HOST}`,
  host = DEFAULT_HOST,
  region = "",
  engineType = "16k_zh",
  hotwordList = DEFAULT_HOTWORDS,
}) {
  if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) {
    throw Object.assign(new Error("没有可转写的 wav 音频。"), { status: 400, code: "EMPTY_AUDIO", provider: "tencent_asr" });
  }

  const body = {
    EngSerViceType: engineType,
    SourceType: 1,
    VoiceFormat: "wav",
    Data: audioBuffer.toString("base64"),
    DataLen: audioBuffer.length,
    WordInfo: 0,
    FilterPunc: 0,
    ConvertNumMode: 1,
  };
  if (hotwordList) body.HotwordList = hotwordList;
  const payload = JSON.stringify(body);
  const signed = createTc3Authorization({
    secretId,
    secretKey,
    service: "asr",
    host,
    action: DEFAULT_ACTION,
    payload,
    timestamp,
  });
  const headers = {
    authorization: signed.authorization,
    "content-type": DEFAULT_CONTENT_TYPE,
    host,
    "x-tc-action": DEFAULT_ACTION,
    "x-tc-timestamp": String(timestamp),
    "x-tc-version": DEFAULT_VERSION,
  };
  if (token) headers["x-tc-token"] = token;
  if (region) headers["x-tc-region"] = region;

  return {
    url: `${endpoint.replace(/\/+$/, "")}/`,
    headers,
    body,
    payload,
  };
}

export async function transcribeWithTencentAsr({
  audioBuffer,
  config = getTencentAsrConfig(),
  diagnostics = null,
  fetchImpl = fetch,
  now = Date.now,
}) {
  if (!config.enabled) {
    throw Object.assign(new Error("腾讯云一句话识别尚未配置。"), {
      status: 503,
      code: "TENCENT_ASR_NOT_CONFIGURED",
      provider: "tencent_asr",
    });
  }

  const request = buildTencentAsrRequest({
    audioBuffer,
    secretId: config.secretId,
    secretKey: config.secretKey,
    token: config.token,
    timestamp: Math.floor(now() / 1000),
    endpoint: config.endpoint,
    host: config.host,
    region: config.region,
    engineType: config.engineType,
    hotwordList: config.hotwordList,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  let responseText = "";

  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.payload,
      signal: controller.signal,
    });
    responseText = await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      throw Object.assign(new Error("腾讯云语音识别请求超时。"), {
        status: 504,
        code: "TENCENT_ASR_TIMEOUT",
        provider: "tencent_asr",
        diagnostics,
      });
    }
    throw Object.assign(new Error(`腾讯云语音识别请求失败：${error.message}`), {
      status: 502,
      code: "TENCENT_ASR_NETWORK_ERROR",
      provider: "tencent_asr",
      diagnostics,
    });
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    // The typed error below avoids returning an upstream HTML body to clients.
  }
  const responsePayload = payload?.Response;
  const requestId = responsePayload?.RequestId || "";

  if (!response.ok || responsePayload?.Error) {
    const upstreamError = responsePayload?.Error;
    throw Object.assign(new Error(upstreamError?.Message || `腾讯云语音识别返回 HTTP ${response.status}。`), {
      status: 502,
      code: upstreamError?.Code || "TENCENT_ASR_UPSTREAM_ERROR",
      provider: "tencent_asr",
      requestId,
      diagnostics,
    });
  }

  const transcript = nonEmpty(responsePayload?.Result);
  if (!transcript) {
    throw Object.assign(new Error("腾讯云语音识别没有返回文本。"), {
      status: 502,
      code: "TENCENT_ASR_EMPTY_RESULT",
      provider: "tencent_asr",
      requestId,
      diagnostics,
    });
  }

  return {
    transcript,
    backend: "tencent_sentence_recognition",
    requestId,
    audioDurationMs: Number.isFinite(responsePayload.AudioDuration) ? responsePayload.AudioDuration : null,
    diagnostics,
  };
}
