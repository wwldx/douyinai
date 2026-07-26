const MODEL_RESPONSE_META = Symbol("modelResponseMeta");

export function readModelResponseMeta(value) {
  return value && typeof value === "object" ? value[MODEL_RESPONSE_META] || null : null;
}

export function createModelClient(config) {
  return {
    createJsonResponse: (request) => createJsonResponse(config, request),
  };
}

async function createJsonResponse(config, { instructions, responsesInput, chatMessages, schema, name, timeoutMs }) {
  if (!config.apiKey) {
    const error = new Error("未配置有效的 OPENAI_API_KEY；请填写 ASCII 格式的真实 API Key，不能保留中文占位符。");
    error.status = 503;
    throw error;
  }

  const requestTimeoutMs = normalizeTimeoutMs(timeoutMs, config.requestTimeoutMs || 50_000);

  if (config.provider === "rightcode_chat") {
    return requestChatJsonResponse(config, { messages: chatMessages, name, timeoutMs: requestTimeoutMs });
  }

  return requestResponsesJsonResponse(config, { instructions, input: responsesInput, schema, name, timeoutMs: requestTimeoutMs });
}

async function requestResponsesJsonResponse(config, { instructions, input, schema, name, timeoutMs }) {
  const requestBody = {
    model: config.model,
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

  if (config.disableResponseStorage) {
    requestBody.store = false;
  }

  if (config.provider === "rightcode_responses_stream") {
    requestBody.stream = true;
  }

  return runWithModelTimeout(timeoutMs, async (signal) => {
    // RightAPI 偶发的连接超时/502 通常在尚未返回任何模型内容时发生。
    // 在同一总超时预算内只重试一次；不重试 4xx、结构化解析错误或已超时的请求。
    const attempts = config.provider === "rightcode_responses_stream" ? 2 : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await requestResponsesJsonAttempt(config, requestBody, signal);
      } catch (error) {
        lastError = error;
        if (signal.aborted || attempt >= attempts || !isRetryableModelError(error)) throw error;
        await waitBeforeRetry(signal, 250);
      }
    }
    throw lastError;
  });
}

async function requestResponsesJsonAttempt(config, requestBody, signal) {
  let response;
  try {
    response = await fetch(`${config.responsesBaseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const wrapped = new Error(`模型服务连接失败：${formatNetworkError(error)}`);
    wrapped.status = 502;
    wrapped.code = "MODEL_CONNECT_ERROR";
    throw wrapped;
  }

  if (requestBody.stream) {
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(extractErrorMessage(raw) || `OpenAI API 请求失败：${response.status}`);
      error.status = response.status;
      error.code = response.status === 502 || response.status === 503
        ? "MODEL_SERVICE_UNAVAILABLE"
        : "MODEL_REQUEST_ERROR";
      throw error;
    }
    const { text, response: completedResponse } = extractSseResponse(raw);
    if (!text) throw invalidModelResponse("模型没有返回可解析文本。");
    return attachModelResponseMeta(parseJsonObjectFromText(text), {
      model: completedResponse?.model || config.model,
      usage: completedResponse?.usage || null,
    });
  }

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `OpenAI API 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = response.status === 502 || response.status === 503
      ? "MODEL_SERVICE_UNAVAILABLE"
      : "MODEL_REQUEST_ERROR";
    throw error;
  }

  const text = extractOutputText(payload);
  if (!text) throw invalidModelResponse("模型没有返回可解析文本。");
  return attachModelResponseMeta(parseJsonObjectFromText(text), {
    model: payload.model || config.model,
    usage: payload.usage || null,
  });
}

function isRetryableModelError(error) {
  if (["MODEL_CONNECT_ERROR", "MODEL_SERVICE_UNAVAILABLE"].includes(error?.code)) return true;
  return !error?.code && (error?.status === 502 || error?.status === 503);
}

function waitBeforeRetry(signal, delayMs) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("请求已取消"), { name: "AbortError" }));
      return;
    }
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    function onAbort() {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(Object.assign(new Error("请求已取消"), { name: "AbortError" }));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function requestChatJsonResponse(config, { messages, name, timeoutMs }) {
  return runWithModelTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${config.chatBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages,
      }),
      signal,
    });

    const payload = await parseResponseJson(response);
    if (!response.ok) {
      const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `Right Code chat 请求失败：${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.code = response.status === 502 || response.status === 503
        ? "MODEL_SERVICE_UNAVAILABLE"
        : "MODEL_REQUEST_ERROR";
      throw error;
    }

    const text = extractChatOutputText(payload);
    if (!text) throw invalidModelResponse(`${name} 没有返回可解析文本。`);
    return attachModelResponseMeta(parseJsonObjectFromText(text), {
      model: payload.model || config.model,
      usage: payload.usage || null,
    });
  });
}

async function runWithModelTimeout(timeoutMs, task) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      const timeoutError = new Error(`上游模型请求超过 ${Math.round(timeoutMs / 1000)} 秒，已取消。`);
      timeoutError.name = "ModelTimeoutError";
      timeoutError.code = "MODEL_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 ? parsed : fallback;
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

function extractSseResponse(raw) {
  const deltas = [];
  let completedResponse = null;
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
      if (event.type === "response.completed" && event.response) {
        completedResponse = event.response;
      }
    } catch {
      continue;
    }
  }
  return { text: deltas.join("").trim(), response: completedResponse };
}

function attachModelResponseMeta(value, meta) {
  if (!value || typeof value !== "object") return value;
  Object.defineProperty(value, MODEL_RESPONSE_META, {
    value: {
      model: meta?.model || null,
      usage: normalizeUsage(meta?.usage),
    },
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return value;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? null,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function extractErrorMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.message || JSON.stringify(parsed).slice(0, 500);
  } catch {
    return raw.slice(0, 500).replace(/\s+/g, " ");
  }
}

function formatNetworkError(error) {
  const parts = [error.message, error.cause?.code, error.cause?.message].filter(Boolean);
  return parts.join(" / ") || "网络请求失败";
}

async function parseResponseJson(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw invalidModelResponse(
      `模型服务返回非 JSON 响应：${raw.slice(0, 300).replace(/\s+/g, " ")}`,
      response.status,
    );
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
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // 统一落到可安全分类的模型响应异常。
      }
    }
    const preview = candidate.slice(0, 500).replace(/\s+/g, " ");
    throw invalidModelResponse(`模型返回不是 JSON：${preview}`);
  }
}

function invalidModelResponse(message, status = 502) {
  const error = new Error(message);
  error.status = status >= 400 ? status : 502;
  error.code = "MODEL_RESPONSE_INVALID";
  return error;
}
