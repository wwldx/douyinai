import { agentSessionHeaders, createAgentRequestId } from "../lib/agentSession.js";

export function errorCodeForHttpStatus(status) {
  if (status === 502 || status === 503) return "MODEL_SERVICE_UNAVAILABLE";
  if (status === 504) return "MODEL_TIMEOUT";
  return "HTTP_ERROR";
}

export async function postJson(url, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 60000;
  const requestId = createAgentRequestId();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const combined = new AbortController();
  const forwardAbort = () => combined.abort();
  controller.signal.addEventListener("abort", forwardAbort, { once: true });
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (controller.signal.aborted || options.signal?.aborted) combined.abort();
  const signal = combined.signal;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...agentSessionHeaders(requestId) },
      body: JSON.stringify(payload),
      signal,
    });
    const responseRequestId = response.headers.get("x-request-id") || requestId;
    let data;
    try {
      data = await response.json();
    } catch {
      const responseError = new Error("服务返回了无法读取的结果");
      responseError.code = response.ok ? "INVALID_RESPONSE" : errorCodeForHttpStatus(response.status);
      responseError.status = response.status;
      responseError.requestId = responseRequestId;
      throw responseError;
    }
    if (!response.ok) {
      const requestError = new Error(data.error || data.detail || `请求失败：${response.status}`);
      requestError.code = data.code || errorCodeForHttpStatus(response.status);
      requestError.status = response.status;
      requestError.requestId = data.requestId || responseRequestId;
      throw requestError;
    }
    return { ...data, requestId: data.requestId || responseRequestId };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("请求已取消或超时");
      timeoutError.code = timedOut ? "CLIENT_TIMEOUT" : "REQUEST_CANCELLED";
      timeoutError.requestId = requestId;
      throw timeoutError;
    }
    if (!error?.code && error?.name === "TypeError") error.code = "NETWORK_ERROR";
    if (error && !error.requestId) error.requestId = requestId;
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    controller.signal.removeEventListener("abort", forwardAbort);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export function compressImage(file, maxSide = 1400, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("图片读取失败")));
    reader.addEventListener("load", () => {
      const img = new Image();
      img.addEventListener("error", () => reject(new Error("图片解析失败")));
      img.addEventListener("load", () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      });
      img.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}

export async function fetchAssetFile(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("示例图片加载失败");
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

export const api = {
  analyzeFridge: (payload, options) => postJson("/api/analyze-fridge", payload, options),
  analyzeTargetDish: (payload, options) => postJson("/api/analyze-target-dish", payload, options),
  planDinner: (payload, options) => postJson("/api/plan-dinner", payload, options),
  planTargetDish: (payload, options) => postJson("/api/plan-target-dish", payload, options),
  eatFirst: (payload, options) => postJson("/api/eat-first", payload, options),
  rescueDish: (payload, options) => postJson("/api/rescue-dish", payload, options),
  generateLifeLog: (payload, options) => postJson("/api/generate-life-log", payload, options),
  recordFeedback: (payload) =>
    postJson("/api/users/xiaolin/feedback", { source: "showcase-ticket", ...payload }, { timeoutMs: 5000 }),
};
