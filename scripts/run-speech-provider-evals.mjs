import { strict as assert } from "node:assert";
import {
  buildTencentAsrRequest,
  createTc3Authorization,
  transcribeWithTencentAsr,
} from "../demo/agent/tencentSpeechTranscriber.mjs";

const timestamp = 1551113065;
const payload = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}';
const signature = createTc3Authorization({
  secretId: "AKIDEXAMPLE",
  secretKey: "SECRETEXAMPLE",
  service: "cvm",
  host: "cvm.tencentcloudapi.com",
  action: "DescribeInstances",
  payload,
  timestamp,
});

assert.equal(signature.date, "2019-02-25");
assert.equal(signature.signedHeaders, "content-type;host;x-tc-action");
assert.equal(signature.signature, "121ced60469f9a7321eb609cce757164c23f381788a980523f7ccc312fd7abfa");
assert.match(signature.authorization, /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/2019-02-25\/cvm\/tc3_request/);
assert.match(signature.authorization, /Signature=[a-f0-9]{64}$/);

const audioBuffer = Buffer.from("RIFF-test-wav");
const request = buildTencentAsrRequest({
  audioBuffer,
  secretId: "AKIDEXAMPLE",
  secretKey: "SECRETEXAMPLE",
  token: "temporary-token",
  timestamp,
});

assert.equal(request.url, "https://asr.tencentcloudapi.com/");
assert.equal(request.headers["content-type"], "application/json; charset=utf-8");
assert.equal(request.headers["x-tc-action"], "SentenceRecognition");
assert.equal(request.headers["x-tc-version"], "2019-06-14");
assert.equal(request.headers["x-tc-token"], "temporary-token");
assert.equal(request.body.SourceType, 1);
assert.equal(request.body.EngSerViceType, "16k_zh");
assert.equal(request.body.VoiceFormat, "wav");
assert.equal(request.body.DataLen, audioBuffer.length);
assert.equal(request.body.Data, audioBuffer.toString("base64"));
assert.match(request.body.HotwordList, /番茄牛腩/);

const fetchCalls = [];
const success = await transcribeWithTencentAsr({
  audioBuffer,
  config: {
    enabled: true,
    secretId: "AKIDEXAMPLE",
    secretKey: "SECRETEXAMPLE",
    token: "",
    timeoutMs: 1000,
  },
  diagnostics: { durationSeconds: 2.4 },
  fetchImpl: async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response(JSON.stringify({
      Response: {
        Result: "今晚想吃番茄牛腩，只有 25 分钟。",
        AudioDuration: 2400,
        RequestId: "request-success",
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
  now: () => timestamp * 1000,
});

assert.equal(fetchCalls.length, 1);
assert.equal(success.transcript, "今晚想吃番茄牛腩，只有 25 分钟。");
assert.equal(success.backend, "tencent_sentence_recognition");
assert.equal(success.requestId, "request-success");
assert.equal(success.audioDurationMs, 2400);

await assert.rejects(
  () => transcribeWithTencentAsr({
    audioBuffer,
    config: {
      enabled: true,
      secretId: "AKIDEXAMPLE",
      secretKey: "SECRETEXAMPLE",
      token: "",
      timeoutMs: 1000,
    },
    fetchImpl: async () => new Response(JSON.stringify({
      Response: {
        Error: {
          Code: "FailedOperation.UserNotRegistered",
          Message: "service is not activated",
        },
        RequestId: "request-error",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    now: () => timestamp * 1000,
  }),
  (error) => error.code === "FailedOperation.UserNotRegistered"
    && error.requestId === "request-error"
    && error.status === 502,
);

await assert.rejects(
  () => transcribeWithTencentAsr({
    audioBuffer,
    config: {
      enabled: false,
      secretId: "",
      secretKey: "",
      token: "",
      timeoutMs: 1000,
    },
  }),
  (error) => error.code === "TENCENT_ASR_NOT_CONFIGURED" && error.status === 503,
);

await assert.rejects(
  () => transcribeWithTencentAsr({
    audioBuffer,
    config: {
      enabled: true,
      secretId: "AKIDEXAMPLE",
      secretKey: "SECRETEXAMPLE",
      token: "",
      timeoutMs: 5,
    },
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
    now: () => timestamp * 1000,
  }),
  (error) => error.code === "TENCENT_ASR_TIMEOUT" && error.status === 504,
);

console.log("Speech provider eval passed: signing/request/success/error/config/timeout");
