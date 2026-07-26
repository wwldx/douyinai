import { readFile } from "node:fs/promises";
import {
  getTencentAsrConfig,
  transcribeWithTencentAsr,
} from "../demo/agent/tencentSpeechTranscriber.mjs";

const audioPath = process.argv[2];
if (!audioPath) {
  throw new Error("用法：node --env-file=.env.local scripts/run-live-speech-smoke.mjs <wav-path>");
}

const config = getTencentAsrConfig();
if (!config.enabled) {
  throw new Error("腾讯云 ASR 未启用，或 SecretId/SecretKey 未读取到。");
}

const audioBuffer = await readFile(audioPath);
const result = await transcribeWithTencentAsr({
  audioBuffer,
  config,
  diagnostics: { source: "live-speech-smoke", bytes: audioBuffer.length },
});

console.log(JSON.stringify({
  ok: true,
  transcript: result.transcript,
  backend: result.backend,
  requestId: result.requestId,
  audioDurationMs: result.audioDurationMs,
}, null, 2));
