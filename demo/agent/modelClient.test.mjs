import test from "node:test";
import assert from "node:assert/strict";
import { createModelClient } from "./modelClient.mjs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
};

function completedStream(value = { ok: true }) {
  const text = JSON.stringify(value);
  return new Response([
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}`,
    `data: ${JSON.stringify({ type: "response.completed", response: { model: "test-model", usage: { total_tokens: 3 } } })}`,
    "data: [DONE]",
    "",
  ].join("\n\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
}

function client(provider = "rightcode_responses_stream") {
  return createModelClient({
    apiKey: "test-key",
    responsesBaseUrl: "https://example.invalid/v1",
    provider,
    model: "test-model",
    disableResponseStorage: true,
  });
}

function request() {
  return {
    instructions: "Return JSON",
    responsesInput: "test",
    schema,
    name: "retry_test",
    timeoutMs: 5_000,
  };
}

test("RightAPI connection timeout retries once inside the same timeout budget", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" };
      throw error;
    }
    return completedStream();
  };
  try {
    assert.deepEqual(await client().createJsonResponse(request()), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RightAPI upstream 502 retries once", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: { message: "temporary upstream failure" } }), { status: 502 })
      : completedStream();
  };
  try {
    assert.deepEqual(await client().createJsonResponse(request()), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-retryable 400 is returned without a second request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });
  };
  try {
    await assert.rejects(client().createJsonResponse(request()), /bad request/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
