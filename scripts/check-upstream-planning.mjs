import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const originArg = args.find((arg) => !arg.startsWith("--"));
const origin = String(originArg || process.env.UPSTREAM_CHECK_ORIGIN || "http://127.0.0.1:4183").replace(/\/$/, "");
const projectRoot = resolve(import.meta.dirname, "..");
const reportPath = resolve(projectRoot, "data/local-cache/upstream-planning-smoke-latest.json");

const inventory = [
  ["鸡腿肉", "肉类", "500 克"],
  ["土豆", "蔬菜", "2 个"],
  ["鲜香菇", "菌菇", "6 朵"],
  ["青椒", "蔬菜", "2 个"],
  ["姜", "调味", "1 块"],
  ["蒜", "调味", "4 瓣"],
  ["小葱", "调味", "2 根"],
  ["食用油", "调味", "足量"],
  ["生抽", "调味", "足量"],
  ["老抽", "调味", "足量"],
  ["蚝油", "调味", "足量"],
  ["料酒", "调味", "足量"],
  ["白糖", "调味", "足量"],
  ["盐", "调味", "足量"],
  ["八角", "香料", "2 个"],
  ["干辣椒", "香料", "少量"],
].map(([name, category, quantityEstimate]) => ({
  name,
  category,
  quantityEstimate,
  confidence: 1,
  state: "用户已确认可用",
  notes: "比赛现场上游自检固定数据",
}));

const payload = {
  planningMode: "inventory_adapted",
  inventoryStatus: "confirmed",
  inventory,
  targetDish: {
    text: "黄焖鸡",
    intentTime: "tonight",
    inputSource: "competition_smoke_script",
    nameSource: "competition_smoke_script",
    nameConfirmed: true,
    imageAnalysis: null,
    shoppingDecision: null,
  },
  userContext: {
    user: {
      name: "比赛现场自检",
      cookingLevel: "入门",
      preferences: ["家常热饭", "按最佳做法"],
      avoid: ["油炸"],
      recentMeals: [],
      goal: "确认材料齐全时上游规划链路正常",
    },
    context: {
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      mealSlot: "晚餐",
      availableCookingTime: "不限",
      timeBudgetId: "flexible",
      energyLevel: "由用户确认",
      nextSchedule: "无",
      pantryConfirmation: { availableItems: [], missingItems: [] },
    },
  },
};

function line(label, value) {
  console.log(`${label} ${value}`);
}

function failureHint(code, status) {
  if (code === "MODEL_CONNECT_ERROR") return "连接上游失败；应用通常已经自动尝试两次，不是 50 秒业务超时。";
  if (code === "MODEL_TIMEOUT" || status === 504) return "模型超过约 50 秒仍未完成。";
  if (code === "MODEL_SERVICE_UNAVAILABLE" || status === 502 || status === 503) return "上游返回 502/503，稍后可原样重试。";
  if (code === "MODEL_RESPONSE_INVALID" || code === "INVALID_RESPONSE") return "上游有响应，但没有通过结构化结果检查。";
  return "请结合 HTTP 状态、错误码和 Request ID 排查。";
}

async function fetchJson(path, options, timeoutMs) {
  const startedAt = performance.now();
  const response = await fetch(`${origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: "服务返回的不是 JSON", rawPreview: text.slice(0, 300) };
  }
  return {
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    requestId: response.headers.get("x-request-id") || body?.requestId || null,
    serverTiming: response.headers.get("server-timing") || null,
    body,
  };
}

async function saveReport(report) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log("\n冰箱晚餐 Agent · 上游规划自检");
line("测试地址：", origin);
line("固定场景：", `黄焖鸡 · 已确认 ${inventory.length} 样材料可用`);

if (dryRun) {
  console.log("\n[仅检查脚本，不访问模型]");
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

let health;
try {
  health = await fetchJson("/api/health", { method: "GET" }, 8_000);
} catch (error) {
  console.error("\n❌ 本地服务无法访问。请先启动 4183 服务，再双击本脚本。");
  console.error(`   ${error?.message || error}`);
  process.exit(3);
}

if (health.status !== 200 || !health.body?.ok) {
  console.error(`\n❌ 本地服务健康检查失败：HTTP ${health.status}`);
  process.exit(3);
}

console.log("\n✅ 本地服务正常");
line("Provider：", health.body.provider || "unknown");
line("Planning model：", health.body.modelRouting?.planning || health.body.model || "unknown");
line("API Key：", health.body.hasApiKey ? "已由服务端配置（不会显示）" : "未配置");
line("规划超时：", `${health.body.modelTimeoutsMs?.planning || "unknown"} ms`);

if (!health.body.hasApiKey) {
  console.error("\n❌ 服务端未读取到 API Key，停止上游测试。");
  process.exit(3);
}

console.log("\n正在发送真实规划请求，请等待……");
const requestId = `competition-smoke-${Date.now()}`;
let result;
try {
  result = await fetchJson("/api/plan-target-dish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-session-id": "competition-upstream-smoke",
      "x-agent-request-id": requestId,
    },
    body: JSON.stringify(payload),
  }, 65_000);
} catch (error) {
  const timedOut = error?.name === "TimeoutError";
  result = {
    status: 0,
    durationMs: null,
    requestId,
    serverTiming: null,
    body: {
      error: timedOut ? "脚本等待超过 65 秒" : error?.message || String(error),
      code: timedOut ? "CLIENT_TIMEOUT" : "NETWORK_ERROR",
    },
  };
}

const plan = result.body?.targetPlan;
const execution = plan?.executionPlan || {};
const missingCritical = plan?.inventoryMatch?.missingCritical || [];
const mustBuy = plan?.shoppingPlan?.mustBuy || [];
const confirmAtHome = plan?.shoppingPlan?.confirmAtHome || [];
const checks = {
  http200: result.status === 200,
  modelSource: result.body?.source === "model",
  correctAgent: result.body?.agent === "targetDishPlannerAgent",
  hasRequestId: Boolean(result.requestId),
  planningMode: plan?.planContext?.planningMode === "inventory_adapted",
  inventoryStatus: plan?.planContext?.inventoryStatus === "confirmed",
  confirmedFood: plan?.targetAssessment?.status === "confirmed_food",
  concreteDish: Boolean(String(execution.dishName || "").trim()),
  hasSteps: Array.isArray(execution.steps) && execution.steps.length > 0,
  noCriticalMissing: missingCritical.length === 0,
  noMustBuy: mustBuy.length === 0,
  noPantryPending: confirmAtHome.length === 0,
  cookAction: ["cook_now", "cook_simplified"].includes(plan?.verdict?.primaryAction),
  readyNow: execution.isExecutableNow === true && execution.blockReason === "none",
};
const passed = Object.values(checks).every(Boolean);

const report = {
  checkedAt: new Date().toISOString(),
  origin,
  scenario: "黄焖鸡 · 模拟冰箱材料充足",
  requestId: result.requestId || requestId,
  durationMs: result.durationMs,
  serverTiming: result.serverTiming,
  health: {
    provider: health.body.provider,
    planningModel: health.body.modelRouting?.planning || health.body.model,
    planningTimeoutMs: health.body.modelTimeoutsMs?.planning,
    hasApiKey: health.body.hasApiKey,
  },
  request: payload,
  response: result.body,
  checks,
  passed,
};
await saveReport(report);

console.log("\n—— 测试结果 ——");
line("耗时：", result.durationMs == null ? "未完成" : `${(result.durationMs / 1000).toFixed(1)} 秒`);
line("HTTP：", result.status || "未收到响应");
line("错误码：", result.body?.code || "无");
line("Request ID：", result.requestId || requestId);
line("来源：", result.body?.source || "无");

if (!result.status || result.status >= 400) {
  console.error(`\n❌ 上游规划失败：${result.body?.error || "未知错误"}`);
  console.error(`   ${failureHint(result.body?.code, result.status)}`);
  line("完整报告：", reportPath);
  process.exit(4);
}

line("执行菜名：", execution.dishName || "缺失");
line("语义判断：", plan?.targetAssessment?.status || "缺失");
line("现在可做：", execution.isExecutableNow === true ? "是" : `否（${execution.blockReason || "未说明"}）`);
line("步骤数量：", Array.isArray(execution.steps) ? execution.steps.length : 0);
line("仍缺材料：", missingCritical.join("、") || "无");
line("必须补买：", mustBuy.map((item) => item?.item || item).join("、") || "无");
line("常备待确认：", confirmAtHome.join("、") || "无");

if (passed) console.log("\n✅ 上游 API、模型响应和材料齐全规划契约均正常。");
else console.warn("\n⚠️ 上游已响应，但“材料齐全”场景没有全部通过业务契约，请查看 checks 和完整报告。");
line("完整报告：", reportPath);
process.exit(passed ? 0 : 2);
