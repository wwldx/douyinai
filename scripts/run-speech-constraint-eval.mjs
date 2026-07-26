import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const baseUrl = String(process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const cases = [
  { text: "今晚想吃番茄牛腩，只有二十五分钟。", terms: [["番茄牛腩"], ["25", "二十五"], ["分钟"]] },
  { text: "我不吃香菜，想要微辣。", terms: [["香菜"], ["微辣"]] },
  { text: "家里只有鸡蛋和西红柿。", terms: [["鸡蛋"], ["西红柿"]] },
  { text: "想少洗锅，最好十五分钟做好。", terms: [["少洗锅"], ["15", "十五"], ["分钟"]] },
  { text: "冰箱里有豆腐和青椒，先把豆腐吃掉。", terms: [["豆腐"], ["青椒"], ["先"]] },
  { text: "黄焖鸡可以用鸡胸肉代替鸡腿吗？", terms: [["黄焖鸡"], ["鸡胸肉"], ["鸡腿"]] },
  { text: "今晚想吃清淡一点，不要太油。", terms: [["清淡"], ["不要太油"]] },
  { text: "我只有空气炸锅，没有炒锅。", terms: [["空气炸锅"], ["炒锅"]] },
  { text: "两个人吃，预算三十元以内。", terms: [["两个人", "2个人"], ["预算"], ["30", "三十"]] },
  { text: "明早要上班，今晚做得简单一点。", terms: [["明早"], ["上班"], ["简单"]] },
];

const workDir = await mkdtemp(join(tmpdir(), "fridge-asr-eval-"));
const results = [];

try {
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const aiffPath = join(workDir, `${index + 1}.aiff`);
    const wavPath = join(workDir, `${index + 1}.wav`);
    await run("say", ["-v", "Tingting", "-o", aiffPath, testCase.text]);
    await run("ffmpeg", ["-loglevel", "error", "-y", "-i", aiffPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath]);
    const audioBuffer = await readFile(wavPath);
    const response = await fetch(`${baseUrl}/api/transcribe-audio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioDataUrl: `data:audio/wav;base64,${audioBuffer.toString("base64")}` }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    const transcript = String(payload.transcript || "").trim();
    const readable = response.ok && testCase.terms.every((alternatives) => alternatives.some((term) => transcript.includes(term)));
    results.push({
      id: index + 1,
      expected: testCase.text,
      transcript,
      readable,
      status: response.status,
      backend: payload.backend || "",
    });
    console.log(`${readable ? "PASS" : "FAIL"} ${index + 1}/10 ${transcript || payload.error || `HTTP ${response.status}`}`);
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

const passed = results.filter((result) => result.readable).length;
console.log(JSON.stringify({ passed, total: results.length, baseUrl, results }, null, 2));
if (passed < 9) throw new Error(`语音约束小集仅 ${passed}/${results.length} 可读，低于 9/10 门槛。`);
