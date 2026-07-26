import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  dinnerPlanSchema,
  fridgeVisionSchema,
  targetDishPlanSchema,
  targetDishVisionSchema,
} from "../demo/agent/schemas.mjs";
import { sanitizeFridgeVision } from "../demo/agent/fridgeVisionSanitizer.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const planningData = await readJson("data/eval/planning-cases.json");
const fridgeCache = await readJson("data/demo-cache/vision/fridge.json");
const targetCache = await readJson("data/demo-cache/vision/target-dishes.json");

const allCases = [
  ...buildFridgeCases(fridgeCache.entries),
  ...buildTargetVisionCases(targetCache.entries),
  ...planningData.cases.map((entry) => ({ ...entry, suite: "planning" })),
];
const cases = selectCases(allCases, args);

const validation = await validateDataset(cases);
console.log(`评测集：${cases.length} 例（视觉 ${cases.filter((item) => item.suite === "vision").length}，规划 ${cases.filter((item) => item.suite === "planning").length}）`);
if (validation.length) {
  validation.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("数据校验：通过");
}

if (args.dryRun) {
  cases.forEach((entry) => console.log(`- ${entry.id} -> ${entry.endpoint}`));
}

if (args.dryRun || validation.length) process.exit();

let results;
if (args.reassessReport) {
  const existingReport = await readJson(args.reassessReport);
  results = reassessExistingResults(existingReport.results, cases);
} else {
  results = [];
  for (const [index, evalCase] of cases.entries()) {
    process.stdout.write(`[${index + 1}/${cases.length}] ${evalCase.id} ... `);
    const result = await runCase(evalCase);
    results.push(result);
    console.log(result.passed ? `PASS ${result.durationMs}ms` : `FAIL ${result.durationMs}ms ${result.failures.join("；")}`);
  }
}

const report = createReport(results);
printReport(report);
await writeReport(report);
if (report.failed > 0) process.exitCode = 1;

async function writeReport(report) {
  if (!args.output) return;
  const outputPath = resolve(projectRoot, args.output);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`报告已写入：${outputPath}`);
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: "http://localhost:4173",
    suite: "all",
    preset: "",
    caseIds: [],
    limit: 0,
    dryRun: false,
    output: "",
    reassessReport: "",
    requireModelSource: false,
    retrievalMode: "",
    timeoutMs: 120000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--require-model-source") parsed.requireModelSource = true;
    else if (arg === "--base-url") parsed.baseUrl = argv[++index];
    else if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.split("=").slice(1).join("=");
    else if (arg === "--suite") parsed.suite = argv[++index];
    else if (arg.startsWith("--suite=")) parsed.suite = arg.split("=")[1];
    else if (arg === "--preset") parsed.preset = argv[++index];
    else if (arg.startsWith("--preset=")) parsed.preset = arg.split("=")[1];
    else if (arg === "--case-id") parsed.caseIds.push(argv[++index]);
    else if (arg.startsWith("--case-id=")) parsed.caseIds.push(arg.split("=").slice(1).join("="));
    else if (arg === "--limit") parsed.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) parsed.limit = Number(arg.split("=")[1]);
    else if (arg === "--output") parsed.output = argv[++index];
    else if (arg.startsWith("--output=")) parsed.output = arg.split("=").slice(1).join("=");
    else if (arg === "--reassess-report") parsed.reassessReport = argv[++index];
    else if (arg.startsWith("--reassess-report=")) parsed.reassessReport = arg.split("=").slice(1).join("=");
    else if (arg === "--retrieval-mode") parsed.retrievalMode = argv[++index];
    else if (arg.startsWith("--retrieval-mode=")) parsed.retrievalMode = arg.split("=")[1];
    else if (arg === "--timeout-ms") parsed.timeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--timeout-ms=")) parsed.timeoutMs = Number(arg.split("=")[1]);
    else throw new Error(`未知参数：${arg}`);
  }
  if (!["all", "vision", "planning"].includes(parsed.suite)) throw new Error(`不支持的 suite：${parsed.suite}`);
  if (parsed.preset && parsed.preset !== "mixed-smoke") throw new Error(`不支持的 preset：${parsed.preset}`);
  if (parsed.retrievalMode && !["off", "positive", "contrast"].includes(parsed.retrievalMode)) {
    throw new Error(`不支持的 retrieval mode：${parsed.retrievalMode}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs < 1000) throw new Error("--timeout-ms 必须是不小于 1000 的数字");
  return parsed;
}

function selectCases(dataset, options) {
  const mixedSmokeIds = [
    "vision-fridge-real-fridge-f63de1",
    "vision-fridge-imgs-ai-day3",
    "vision-target-dish-huangmenji",
    "vision-target-dish-huiguorou",
    "target-huangmenji-missing-chicken",
    "target-chicken-wings-food-safety",
    "dinner-fast-tomato-eggs",
    "dinner-uncertain-meat-safety",
  ];
  let selected = dataset;
  if (options.preset === "mixed-smoke") {
    const byId = new Map(dataset.map((entry) => [entry.id, entry]));
    selected = mixedSmokeIds.map((id) => byId.get(id)).filter(Boolean);
    if (selected.length !== mixedSmokeIds.length) {
      const missing = mixedSmokeIds.filter((id) => !byId.has(id));
      throw new Error(`mixed-smoke 缺少评测用例：${missing.join("、")}`);
    }
  }
  if (options.caseIds.length) {
    const requested = new Set(options.caseIds);
    selected = selected.filter((entry) => requested.has(entry.id));
    const found = new Set(selected.map((entry) => entry.id));
    const missing = options.caseIds.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`未找到 case-id：${missing.join("、")}`);
  }
  selected = selected.filter((entry) => options.suite === "all" || entry.suite === options.suite);
  return selected.slice(0, options.limit || undefined);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(projectRoot, path), "utf8"));
}

function reassessExistingResults(existingResults, dataset) {
  const casesById = new Map(dataset.map((entry) => [entry.id, entry]));
  return (existingResults || []).filter((result) => casesById.has(result.id)).map((result) => {
    const evalCase = casesById.get(result.id);
    if (result.status !== 200 || !result.output) return result;
    const payload = evalCase.suite === "vision"
      ? (evalCase.expected.type === "fridge" ? { vision: result.output } : { targetVision: result.output })
      : (evalCase.endpoint.endsWith("plan-target-dish") ? { targetPlan: result.output } : { plan: result.output });
    const assessment = evalCase.suite === "vision"
      ? assessVision(evalCase, payload)
      : assessPlanning(evalCase, payload);
    if (args.requireModelSource && result.source !== "model") {
      assessment.passed = false;
      assessment.failures.push(`要求真实模型来源，实际为 ${result.source || "unknown"}`);
    }
    if (evalCase.suite === "planning" && args.retrievalMode) {
      const retrievalFailures = validateRetrievalResult(
        result.retrieval || summarizeRetrieval(null, args.retrievalMode),
        args.retrievalMode,
      );
      if (retrievalFailures.length) {
        assessment.passed = false;
        assessment.failures.push(...retrievalFailures);
      }
    }
    return {
      ...result,
      ...assessment,
      source: result.source,
      failureTypes: classifyFailures(assessment.failures),
    };
  });
}

function buildFridgeCases(entries) {
  return entries.map((entry) => {
    const sanitized = sanitizeFridgeVision(entry.vision).vision;
    return {
      id: `vision-fridge-${entry.id}`,
      suite: "vision",
      endpoint: "/api/analyze-fridge",
      sourcePath: entry.sourcePath,
      sourceFileName: entry.fileName,
      expected: { type: "fridge", itemNames: sanitized.items.map((item) => item.name) },
    };
  });
}

function buildTargetVisionCases(entries) {
  return entries.map((entry) => ({
    id: `vision-target-${entry.id}`,
    suite: "vision",
    endpoint: "/api/analyze-target-dish",
    sourcePath: entry.sourcePath,
    sourceFileName: entry.fileName,
    expected: {
      type: "target",
      dishName: entry.targetVision.dishName,
      ingredients: entry.targetVision.likelyIngredients,
    },
  }));
}

async function validateDataset(dataset) {
  const failures = [];
  const ids = new Set();
  for (const entry of dataset) {
    if (!entry.id || ids.has(entry.id)) failures.push(`ID 缺失或重复：${entry.id || "<empty>"}`);
    ids.add(entry.id);
    if (!entry.endpoint?.startsWith("/api/")) failures.push(`${entry.id} endpoint 非法`);
    if (entry.suite === "vision") {
      try {
        await readFile(resolve(projectRoot, entry.sourcePath));
      } catch {
        failures.push(`${entry.id} 图片不存在：${entry.sourcePath}`);
      }
    } else if (!entry.input?.userContext) {
      failures.push(`${entry.id} 缺少 userContext`);
    }
  }
  if (args.suite === "all" && !args.limit && !args.preset && !args.caseIds.length && dataset.length !== 30) {
    failures.push(`完整评测集应为 30 例，当前 ${dataset.length} 例`);
  }
  return failures;
}

async function runCase(evalCase) {
  const startedAt = performance.now();
  try {
    const body = evalCase.suite === "vision"
      ? await visionRequestBody(evalCase)
      : { ...evalCase.input, ...(args.retrievalMode ? { retrievalMode: args.retrievalMode } : {}) };
    const response = await fetch(`${args.baseUrl.replace(/\/$/, "")}${evalCase.endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.detail || `HTTP ${response.status}`);
      error.status = response.status;
      error.requestId = payload.requestId || response.headers.get("x-request-id") || "";
      error.failureType = response.status >= 500 ? "upstream" : "http";
      throw error;
    }
    const assessment = evalCase.suite === "vision"
      ? assessVision(evalCase, payload)
      : assessPlanning(evalCase, payload);
    const retrieval = evalCase.suite === "planning" ? summarizeRetrieval(payload.retrieval, body.retrievalMode) : null;
    if (args.requireModelSource && payload.source !== "model") {
      assessment.passed = false;
      assessment.failures.push(`要求真实模型来源，实际为 ${payload.source || "unknown"}`);
    }
    if (evalCase.suite === "planning" && args.retrievalMode) {
      const retrievalFailures = validateRetrievalResult(retrieval, args.retrievalMode);
      if (retrievalFailures.length) {
        assessment.passed = false;
        assessment.failures.push(...retrievalFailures);
      }
    }
    const output = evalCase.suite === "vision"
      ? (evalCase.expected.type === "fridge" ? payload.vision : payload.targetVision)
      : (evalCase.endpoint.endsWith("plan-target-dish") ? payload.targetPlan : payload.plan);
    return {
      id: evalCase.id,
      suite: evalCase.suite,
      endpoint: evalCase.endpoint,
      durationMs: Math.round(performance.now() - startedAt),
      status: response.status,
      requestId: response.headers.get("x-request-id") || "",
      serverTiming: response.headers.get("server-timing") || "",
      ...assessment,
      source: payload.source || assessment.source || "unknown",
      provider: payload.provider || null,
      model: payload.model || null,
      usage: payload.usage || null,
      retrieval,
      output,
      failureTypes: classifyFailures(assessment.failures),
    };
  } catch (error) {
    return {
      id: evalCase.id,
      suite: evalCase.suite,
      endpoint: evalCase.endpoint,
      durationMs: Math.round(performance.now() - startedAt),
      status: error.status || 0,
      requestId: error.requestId || "",
      passed: false,
      failures: [error.message],
      failureTypes: [error.failureType || classifyFailure(error.message)],
      metrics: {},
      source: "error",
      provider: null,
      model: null,
      usage: null,
      retrieval: null,
      output: null,
    };
  }
}

async function visionRequestBody(evalCase) {
  const buffer = await readFile(resolve(projectRoot, evalCase.sourcePath));
  const compressed = await compressLikeShowcase(buffer);
  return {
    imageDataUrl: `data:image/jpeg;base64,${compressed.toString("base64")}`,
    sourceFileName: evalCase.sourceFileName,
  };
}

function compressLikeShowcase(buffer) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0",
      "-vf", "scale='min(1400,iw)':'min(1400,ih)':force_original_aspect_ratio=decrease",
      "-frames:v", "1",
      "-c:v", "mjpeg",
      "-q:v", "3",
      "-f", "image2pipe",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && output.length) resolvePromise(Buffer.concat(output));
      else reject(new Error(`评测图片压缩失败：${Buffer.concat(errors).toString("utf8").trim() || `ffmpeg exit ${code}`}`));
    });
    child.stdin.end(buffer);
  });
}

function assessVision(evalCase, payload) {
  const isFridge = evalCase.expected.type === "fridge";
  const value = isFridge ? payload.vision : payload.targetVision;
  const schemaFailures = validateSchema(value, isFridge ? fridgeVisionSchema : targetDishVisionSchema);
  const failures = schemaFailures.map((item) => `schema ${item}`);
  const metrics = { schemaValid: schemaFailures.length === 0 };

  if (isFridge) {
    const confirmed = (value?.items || []).map((item) => item.name);
    const uncertain = (value?.uncertainItems || []).map((item) => item.description);
    const confirmedMatches = evalCase.expected.itemNames.filter((name) => confirmed.some((candidate) => looseMatch(name, candidate)));
    const acknowledgedMatches = evalCase.expected.itemNames.filter((name) => [...confirmed, ...uncertain].some((candidate) => looseMatch(name, candidate)));
    metrics.confirmedItemRecall = round(confirmedMatches.length / Math.max(1, evalCase.expected.itemNames.length));
    metrics.acknowledgedItemRecall = round(acknowledgedMatches.length / Math.max(1, evalCase.expected.itemNames.length));
    // 保守地放入 uncertainItems 仍代表模型看到了该区域；比赛链路会让用户确认，
    // 因此质量门禁检查“已确认 + 已明确标为不确定”的覆盖率，而不是鼓励模型硬猜。
    metrics.itemRecall = metrics.acknowledgedItemRecall;
    if (metrics.itemRecall < 0.5) failures.push(`食材覆盖率 ${metrics.itemRecall} < 0.5`);
  } else {
    metrics.dishNameMatch = looseMatch(evalCase.expected.dishName, value?.dishName || "");
    const actual = value?.likelyIngredients || [];
    const matched = evalCase.expected.ingredients.filter((name) => actual.some((candidate) => looseMatch(name, candidate)));
    metrics.ingredientRecall = round(matched.length / Math.max(1, evalCase.expected.ingredients.length));
    metrics.dishNameUncertaintyAcknowledged = !metrics.dishNameMatch
      && /疑似|可能|或/.test(String(value?.dishName || ""))
      && Number(value?.confidence || 1) <= 0.85
      && Array.isArray(value?.warnings)
      && value.warnings.length > 0;
    metrics.dishNameAccepted = metrics.dishNameMatch
      || (metrics.dishNameUncertaintyAcknowledged && metrics.ingredientRecall >= 0.5);
    if (!metrics.dishNameAccepted) failures.push(`菜名既不匹配也未保守表达歧义：${value?.dishName || "<empty>"}`);
    if (metrics.ingredientRecall < 0.5) failures.push(`关键材料召回率 ${metrics.ingredientRecall} < 0.5`);
  }
  return { passed: failures.length === 0, failures, metrics, source: payload.source || "unknown" };
}

function assessPlanning(evalCase, payload) {
  const isTarget = evalCase.endpoint.endsWith("plan-target-dish");
  const value = isTarget ? payload.targetPlan : payload.plan;
  const schemaFailures = validateSchema(value, isTarget ? targetDishPlanSchema : dinnerPlanSchema);
  const action = isTarget ? value?.verdict?.primaryAction : value?.decision;
  const text = JSON.stringify(value || {});
  const expected = evalCase.expectations || {};
  const failures = schemaFailures.map((item) => `schema ${item}`);
  const actionValid = !expected.allowedActions?.length || expected.allowedActions.includes(action);
  const requiredHit = !expected.requiredAny?.length || expected.requiredAny.some((keyword) => text.includes(keyword));
  const forbiddenHit = findForbiddenViolation(text, expected.forbiddenAny || []);
  const missingText = JSON.stringify(value?.inventoryMatch?.missingCritical || []);
  const missingHit = !expected.missingCriticalAny?.length || expected.missingCriticalAny.some((keyword) => missingText.includes(keyword));

  if (!actionValid) failures.push(`动作 ${action || "<empty>"} 不在允许集合`);
  if (!requiredHit) failures.push("未覆盖任一关键语义");
  if (forbiddenHit) failures.push(`出现禁用语义：${forbiddenHit}`);
  if (!missingHit) failures.push("关键缺料未命中");

  return {
    passed: failures.length === 0,
    failures,
    metrics: { schemaValid: schemaFailures.length === 0, actionValid, requiredHit, forbiddenSafe: !forbiddenHit, missingHit },
    action,
  };
}

function findForbiddenViolation(text, keywords) {
  for (const keyword of keywords) {
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(keyword, offset);
      if (index < 0) break;
      const prefix = text.slice(Math.max(0, index - 16), index);
      const suffix = text.slice(index + keyword.length, index + keyword.length + 16);
      const negatedBefore = /(?:避免|避开|拒绝|禁止|减少|少吃|少用|不(?:要|用|安排|建议|选择|采用|进行|需要|做)?|无需)[^，。；！？]{0,16}$/u.test(prefix);
      const negatedAfter = /^(?:食品|做法|操作)?(?:，|、|\s)*(?:应|要)?(?:避免|少吃|不选|不建议)/u.test(suffix);
      if (!negatedBefore && !negatedAfter) return keyword;
      offset = index + keyword.length;
    }
  }
  return null;
}

function validateSchema(value, schema, path = "$") {
  const failures = [];
  if (!schema) return failures;
  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return [`${path} 应为 integer`];
  } else if (schema.type && type !== schema.type) {
    return [`${path} 应为 ${schema.type}，实际 ${type}`];
  }
  if (schema.enum && !schema.enum.includes(value)) failures.push(`${path} 不在 enum 中`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) failures.push(`${path} 小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) failures.push(`${path} 大于 ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) failures.push(`${path} 少于 ${schema.minItems} 项`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) failures.push(`${path} 多于 ${schema.maxItems} 项`);
    value.forEach((item, index) => failures.push(...validateSchema(item, schema.items, `${path}[${index}]`)));
  }
  if (type === "object" && value) {
    for (const key of schema.required || []) if (!(key in value)) failures.push(`${path}.${key} 缺失`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) failures.push(`${path}.${key} 不允许`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) failures.push(...validateSchema(value[key], childSchema, `${path}.${key}`));
    }
  }
  return failures;
}

function looseMatch(left, right) {
  const normalizeName = (value) => String(value || "")
    .replace(/\s+/g, "")
    .replace(/西红柿/g, "番茄")
    .replace(/彩椒/g, "青椒")
    .replace(/圆白菜|包菜/g, "卷心菜")
    .replace(/花菜|菜花/g, "花椰菜")
    .replace(/绿叶蔬菜|绿叶菜/g, "叶菜")
    .replace(/罐装饮料|饮料罐/g, "饮料")
    .replace(/[^、，]*(?:奶皮子|无蔗糖)?酸奶[^、，]*/g, "酸奶");
  const a = normalizeName(left);
  const b = normalizeName(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function createReport(results) {
  const passed = results.filter((item) => item.passed).length;
  const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
  const vision = results.filter((item) => item.suite === "vision");
  const planning = results.filter((item) => item.suite === "planning");
  const sourceCounts = countValues(results.map((item) => item.source || "unknown"));
  const providerCounts = countValues(results.map((item) => item.provider || "unknown"));
  const modelCounts = countValues(results.map((item) => item.model || "unknown"));
  const failureCounts = countValues(results.flatMap((item) => item.failureTypes || []));
  return {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    selection: {
      suite: args.suite,
      preset: args.preset || null,
      caseIds: args.caseIds,
      limit: args.limit || null,
      requireModelSource: args.requireModelSource,
      retrievalMode: args.retrievalMode || null,
      timeoutMs: args.timeoutMs,
      visionInput: "jpeg-max1400-showcase-equivalent",
    },
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: round(passed / Math.max(1, results.length)),
    latencyMs: {
      average: Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      vision: latencySummary(vision),
      planning: latencySummary(planning),
    },
    sourceCounts,
    providerCounts,
    modelCounts,
    failureCounts,
    usage: usageSummary(results),
    metrics: {
      visionSchemaRate: rate(vision, (item) => item.metrics.schemaValid),
      planningSchemaRate: rate(planning, (item) => item.metrics.schemaValid),
      planningActionRate: rate(planning, (item) => item.metrics.actionValid),
      planningSafetyRate: rate(planning, (item) => item.metrics.forbiddenSafe),
    },
    results,
  };
}

function summarizeRetrieval(retrieval, requestedMode) {
  const cases = Array.isArray(retrieval?.cases) ? retrieval.cases : [];
  return {
    mode: retrieval?.mode || requestedMode || "off",
    caseCount: cases.length,
    caseIds: cases.map((item) => item.caseId),
    roles: cases.map((item) => item.role),
  };
}

function validateRetrievalResult(retrieval, requestedMode) {
  const failures = [];
  if (retrieval.mode !== requestedMode) {
    failures.push(`检索实际模式 ${retrieval.mode} 与请求 ${requestedMode} 不一致`);
    return failures;
  }
  if (requestedMode === "off") {
    if (retrieval.caseCount !== 0) failures.push(`off 模式不应返回 Case，实际 ${retrieval.caseCount} 条`);
    return failures;
  }
  if (retrieval.caseCount === 0) failures.push(`${requestedMode} 模式未返回 Case`);
  if (requestedMode === "positive" && retrieval.roles.some((role) => role !== "positive")) {
    failures.push(`positive 模式包含非正例角色：${retrieval.roles.join("、")}`);
  }
  if (requestedMode === "contrast") {
    if (!retrieval.roles.includes("positive")) failures.push("contrast 模式缺少正例");
    if (!retrieval.roles.includes("negative")) failures.push("contrast 模式缺少反例");
  }
  return failures;
}

function classifyFailures(failures) {
  return [...new Set((failures || []).map(classifyFailure))];
}

function classifyFailure(message) {
  const text = String(message || "");
  if (/要求真实模型来源|cache|来源/.test(text)) return "source";
  if (/schema|应为|缺失|不允许|enum/.test(text)) return "schema";
  if (/HTTP|模型服务|上游|TLS|SSL|fetch failed|超时|timeout/i.test(text)) return "upstream";
  if (/检索|动作|召回|菜名|关键语义|禁用语义|缺料/.test(text)) return "quality";
  return "other";
}

function countValues(values) {
  return Object.fromEntries([...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function latencySummary(items) {
  const values = items.map((item) => item.durationMs).sort((a, b) => a - b);
  return {
    count: values.length,
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function usageSummary(items) {
  const available = items.filter((item) => item.usage);
  const sum = (key) => available.reduce((total, item) => total + (Number(item.usage?.[key]) || 0), 0);
  return {
    casesWithUsage: available.length,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    reasoningTokens: sum("reasoningTokens"),
  };
}

function rate(items, predicate) {
  return round(items.filter(predicate).length / Math.max(1, items.length));
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
}

function printReport(report) {
  console.log("\n=== 评测汇总 ===");
  console.log(`通过：${report.passed}/${report.total} (${Math.round(report.passRate * 100)}%)`);
  console.log(`延迟：avg ${report.latencyMs.average}ms / p50 ${report.latencyMs.p50}ms / p95 ${report.latencyMs.p95}ms`);
  console.log(`Schema：视觉 ${Math.round(report.metrics.visionSchemaRate * 100)}% / 规划 ${Math.round(report.metrics.planningSchemaRate * 100)}%`);
  console.log(`规划动作：${Math.round(report.metrics.planningActionRate * 100)}% / 禁用语义规避：${Math.round(report.metrics.planningSafetyRate * 100)}%`);
  console.log(`来源：${JSON.stringify(report.sourceCounts)}`);
  console.log(`Provider：${JSON.stringify(report.providerCounts)} / 模型：${JSON.stringify(report.modelCounts)}`);
  if (report.usage.casesWithUsage) console.log(`Token：${JSON.stringify(report.usage)}`);
  if (Object.keys(report.failureCounts).length) console.log(`失败分类：${JSON.stringify(report.failureCounts)}`);
}
