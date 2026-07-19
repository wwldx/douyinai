import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const projectRoot = resolve(import.meta.dirname, "..");
const baseUrl = String(process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const outputPath = resolve(projectRoot, process.argv[3] || "docs/verification/reports/targeted-model-evidence.json");

const MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

async function imageDataUrl(relativePath) {
  const path = resolve(projectRoot, relativePath);
  const bytes = await readFile(path);
  const mime = MIME_TYPES.get(extname(path).toLowerCase());
  if (!mime) throw new Error(`不支持的图片格式：${path}`);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function postJson(path, body) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(70_000),
  });
  const payload = await response.json();
  return {
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    requestId: response.headers.get("x-request-id"),
    serverTiming: response.headers.get("server-timing"),
    payload,
  };
}

function assessLifeLog(result) {
  const value = result.payload?.lifeLog;
  const warnings = Array.isArray(value?.warnings) ? value.warnings.join(" ") : "";
  const suggestedShots = Array.isArray(value?.suggestedShots) ? value.suggestedShots : [];
  const failures = [];
  if (result.status !== 200) failures.push(`HTTP ${result.status}`);
  if (result.payload?.source !== "model") failures.push(`来源不是 model：${result.payload?.source || "unknown"}`);
  if (!Array.isArray(value?.titleOptions) || value.titleOptions.length < 2) failures.push("标题候选不足 2 条");
  if (!String(value?.coverText || "").trim() || String(value.coverText).length > 12) failures.push("封面文案为空或超过 12 字");
  if (!String(value?.voiceoverDraft || "").trim()) failures.push("旁白草稿为空");
  if (!suggestedShots.length || suggestedShots.some((item) => {
    const text = typeof item === "object" ? `${item?.shot || ""} ${item?.onScreenText || ""}` : String(item);
    return !/补拍|可以|建议|镜头/.test(text);
  })) {
    failures.push("补拍镜头没有保持建议语气");
  }
  if (!/确认|编辑/.test(warnings)) failures.push("缺少人工确认或编辑提醒");
  return { passed: failures.length === 0, failures };
}

function assessUnknownStepRescue(result) {
  const value = result.payload?.dishRescue;
  const text = JSON.stringify(value || {});
  const failures = [];
  if (result.status !== 200) failures.push(`HTTP ${result.status}`);
  if (result.payload?.source !== "model") failures.push(`来源不是 model：${result.payload?.source || "unknown"}`);
  if (value?.assessment?.category !== "next_step") failures.push(`类别不是 next_step：${value?.assessment?.category || "unknown"}`);
  if (value?.assessment?.needsConfirmation !== true) failures.push("完全说不清步骤时未要求用户确认");
  if (!String(value?.askUser || "").trim()) failures.push("完全说不清步骤时没有追问");
  if (!Array.isArray(value?.actions) || value.actions.length < 1 || value.actions.length > 3) failures.push("动作数量不在 1-3 条");
  if (!/不能|无法|确认|不确定|仅凭/.test(text)) failures.push("缺少不确定性边界表达");
  return { passed: failures.length === 0, failures };
}

const lifeLogImage = await imageDataUrl("assets/菜/黄焖鸡-示例.png");
const rescueImage = await imageDataUrl("assets/dish-rescue/tomato-eggs-too-watery-demo.png");

const lifeLog = await postJson("/api/generate-life-log", {
  imageDataUrl: lifeLogImage,
  sourceFileName: "u10-life-log-model-20260718.png",
  mealContext: {
    mealName: "黄焖鸡",
    summary: "用户确认完成了一锅黄焖鸡；仅生成可编辑生活记录草稿。",
  },
});
lifeLog.assessment = assessLifeLog(lifeLog);

const unknownStepRescue = await postJson("/api/rescue-dish", {
  imageDataUrl: rescueImage,
  sourceFileName: "u20-unknown-step-20260718.png",
  category: "next_step",
  symptom: "说不清",
  description: "我完全说不清做到哪一步，只知道锅里现在还有不少汁。",
  dishContext: {
    dishName: "番茄炒蛋",
    summary: "用户正在照着方案做番茄炒蛋。",
    servings: "1 人",
    currentStep: "",
    steps: ["鸡蛋炒至凝固后盛出", "番茄炒出汁", "倒回鸡蛋合炒", "收汁后调味出锅"],
  },
});
unknownStepRescue.assessment = assessUnknownStepRescue(unknownStepRescue);

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  modelCalls: 2,
  passed: [lifeLog, unknownStepRescue].filter((item) => item.assessment.passed).length,
  total: 2,
  results: {
    lifeLog,
    unknownStepRescue,
  },
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  passed: report.passed,
  total: report.total,
  lifeLog: {
    durationMs: lifeLog.durationMs,
    source: lifeLog.payload?.source,
    model: lifeLog.payload?.model,
    usage: lifeLog.payload?.usage,
    failures: lifeLog.assessment.failures,
  },
  unknownStepRescue: {
    durationMs: unknownStepRescue.durationMs,
    source: unknownStepRescue.payload?.source,
    model: unknownStepRescue.payload?.model,
    usage: unknownStepRescue.payload?.usage,
    failures: unknownStepRescue.assessment.failures,
  },
  outputPath,
}, null, 2));

if (report.passed !== report.total) process.exitCode = 1;
