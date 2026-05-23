export function createModelClient(config) {
  return {
    createJsonResponse: (request) => createJsonResponse(config, request),
  };
}

async function createJsonResponse(config, { instructions, responsesInput, chatMessages, schema, name }) {
  if (!config.apiKey) {
    const error = new Error("缺少 OPENAI_API_KEY，已回退到本地缓存演示。");
    error.status = 503;
    throw error;
  }

  if (config.provider === "rightcode_chat") {
    return requestChatJsonResponse(config, { messages: chatMessages, name });
  }

  return requestResponsesJsonResponse(config, { instructions, input: responsesInput, schema, name });
}

async function requestResponsesJsonResponse(config, { instructions, input, schema, name }) {
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

  let response;
  try {
    response = await fetch(`${config.responsesBaseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const wrapped = new Error(`模型服务连接失败：${formatNetworkError(error)}`);
    wrapped.status = 502;
    throw wrapped;
  }

  if (requestBody.stream) {
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(extractErrorMessage(raw) || `OpenAI API 请求失败：${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = extractSseOutputText(raw);
    if (!text) throw new Error("模型没有返回可解析文本。");
    return parseJsonObjectFromText(text);
  }

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `OpenAI API 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("模型没有返回可解析文本。");
  return parseJsonObjectFromText(text);
}

async function requestChatJsonResponse(config, { messages, name }) {
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
  });

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    const message = payload.error?.message || payload.message || JSON.stringify(payload).slice(0, 500) || `Right Code chat 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = extractChatOutputText(payload);
  if (!text) throw new Error(`${name} 没有返回可解析文本。`);
  return parseJsonObjectFromText(text);
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

function extractSseOutputText(raw) {
  const deltas = [];
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
    } catch {
      continue;
    }
  }
  return deltas.join("").trim();
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
    const error = new Error(`模型服务返回非 JSON 响应：${raw.slice(0, 300).replace(/\s+/g, " ")}`);
    error.status = response.status;
    throw error;
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
      return JSON.parse(candidate.slice(start, end + 1));
    }
    const preview = candidate.slice(0, 500).replace(/\s+/g, " ");
    throw new Error(`模型返回不是 JSON：${preview}`);
  }
}
