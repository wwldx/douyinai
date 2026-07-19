import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const cachePath = fileURLToPath(new URL("../data/demo-cache/vision/life-log.json", import.meta.url));
const cache = JSON.parse(await readFile(cachePath, "utf8"));
const bannedClaims = [
  "已发布",
  "播放量",
  "点赞量",
  "保证好吃",
  "营养均衡",
  "安全食用",
  "已经补拍",
];
let passed = 0;

assert(Array.isArray(cache.entries) && cache.entries.length > 0, "生活记录缓存不能为空。");

for (const entry of cache.entries) {
  const draft = entry.lifeLog;
  assert(entry.fileName && draft, `${entry.id || "unknown"}: 缺少文件名或 lifeLog。`);
  assert(typeof draft.dishName === "string" && draft.dishName.trim(), `${entry.id}: 缺少 dishName。`);
  assert(Number.isFinite(draft.confidence) && draft.confidence >= 0 && draft.confidence <= 1, `${entry.id}: confidence 越界。`);
  assert(typeof draft.visualSummary === "string" && draft.visualSummary.trim(), `${entry.id}: 缺少 visualSummary。`);
  assert(Array.isArray(draft.titleOptions) && draft.titleOptions.length >= 1 && draft.titleOptions.length <= 3, `${entry.id}: titleOptions 数量不合法。`);
  assert(typeof draft.coverText === "string" && [...draft.coverText].length <= 18, `${entry.id}: coverText 过长。`);
  assert(typeof draft.voiceoverDraft === "string" && draft.voiceoverDraft.length <= 180, `${entry.id}: voiceoverDraft 过长。`);
  assert(Array.isArray(draft.suggestedShots) && draft.suggestedShots.length >= 1 && draft.suggestedShots.length <= 5, `${entry.id}: suggestedShots 数量不合法。`);
  assert(draft.suggestedShots.every((shot) => shot.shot?.includes("补拍") && shot.onScreenText), `${entry.id}: 镜头必须明确是补拍建议。`);
  assert(Array.isArray(draft.tags) && draft.tags.length >= 1 && draft.tags.length <= 8, `${entry.id}: tags 数量不合法。`);
  assert(Array.isArray(draft.warnings) && draft.warnings.some((warning) => /确认|编辑/.test(warning)), `${entry.id}: 缺少人工确认提醒。`);

  const serialized = JSON.stringify(draft);
  for (const claim of bannedClaims) {
    assert(!serialized.includes(claim), `${entry.id}: 包含禁止的事实或效果声称“${claim}”。`);
  }
  passed += 1;
}

console.log(`Life-log cache eval passed: ${passed}/${cache.entries.length}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
