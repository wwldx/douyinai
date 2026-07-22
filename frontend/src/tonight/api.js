import { agentSessionHeaders, createAgentRequestId } from "../lib/agentSession";

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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(data.error || data.detail || `请求失败：${response.status}`);
      requestError.code = data.code || (response.status === 504 ? "MODEL_TIMEOUT" : "HTTP_ERROR");
      requestError.status = response.status;
      requestError.requestId = data.requestId || "";
      throw requestError;
    }
    return { ...data, requestId: data.requestId || response.headers.get("x-request-id") || "" };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("请求已取消或超时");
      timeoutError.code = timedOut ? "CLIENT_TIMEOUT" : "REQUEST_CANCELLED";
      timeoutError.requestId = requestId;
      throw timeoutError;
    }
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
  recordFeedback: (payload) =>
    postJson("/api/users/xiaolin/feedback", { source: "showcase-ticket", ...payload }, { timeoutMs: 5000 }),
};
