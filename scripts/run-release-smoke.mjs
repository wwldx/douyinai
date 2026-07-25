const baseUrl = normalizeBaseUrl(process.env.BASE_URL || process.argv[2] || "http://localhost:4173");
const requireApiKey = process.env.REQUIRE_API_KEY === "true";
const requireTencentAsr = process.env.REQUIRE_TENCENT_ASR === "true";
const expectedModelRouting = {
  vision: process.env.EXPECT_VISION_MODEL,
  planning: process.env.EXPECT_PLANNING_MODEL,
  lifeLog: process.env.EXPECT_LIFE_LOG_MODEL,
};
const checks = [];

await checkPage("展示端", "/", (text) => text.includes("<div id=\"root\"></div>"));
await checkPage("开发检验台", "/dev.html", (text) => text.includes("冰箱晚餐 Agent"));

const healthResponse = await fetchUrl("/api/health");
assertStatus(healthResponse, 200, "健康检查");
const health = await healthResponse.json();
assert(health.ok === true, "健康检查未返回 ok=true。");
assert(Boolean(health.agentRuntime), "健康检查缺少 agentRuntime。");
assert(Boolean(health.modelRouting?.vision), "健康检查缺少视觉模型路由。");
assert(Boolean(health.modelRouting?.planning), "健康检查缺少规划模型路由。");
assert(Boolean(health.modelRouting?.lifeLog), "健康检查缺少生活记录模型路由。");
assert(healthResponse.headers.get("x-content-type-options") === "nosniff", "缺少 nosniff 安全头。");
assert(Boolean(healthResponse.headers.get("x-request-id")), "缺少 x-request-id。");
assert(Boolean(healthResponse.headers.get("permissions-policy")), "缺少 permissions-policy。");
if (requireApiKey) assert(health.hasApiKey === true, "REQUIRE_API_KEY=true，但服务未读取到 API Key。");
if (requireTencentAsr) {
  assert(health.speech?.tencentAsrEnabled === true, "REQUIRE_TENCENT_ASR=true，但腾讯云 ASR 未启用或凭证未读取到。");
}
for (const [task, expectedModel] of Object.entries(expectedModelRouting)) {
  if (!expectedModel) continue;
  assert(
    health.modelRouting?.[task] === expectedModel,
    `${task} 模型路由预期为 ${expectedModel}，实际为 ${health.modelRouting?.[task] || "未配置"}。`,
  );
}
checks.push(`健康检查（provider=${health.provider}, vision=${health.modelRouting.vision}, planning=${health.modelRouting.planning}, lifeLog=${health.modelRouting.lifeLog}, hasApiKey=${health.hasApiKey}）`);
if (requireTencentAsr) checks.push(`腾讯云 ASR 已启用（engine=${health.speech.tencentAsrEngine}）`);
if (Object.values(expectedModelRouting).some(Boolean)) checks.push("任务模型路由与发布预期一致");

const previewResponse = await fetchUrl("/api/case-retrieval/preview", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    inventory: [{ name: "鸡腿" }, { name: "土豆" }, { name: "青椒" }],
    targetDish: { text: "黄焖鸡" },
    userContext: {
      user: { cookingLevel: "beginner", preferences: ["少洗锅"], avoid: [] },
      context: { availableCookingTime: 30, energyLevel: "medium" },
    },
    retrievalMode: "contrast",
    limit: 4,
  }),
});
assertStatus(previewResponse, 200, "Case 检索预览");
const preview = await previewResponse.json();
assert(Array.isArray(preview.retrieval?.cases), "Case 检索预览缺少 cases。");
assert(preview.retrieval.cases.length > 0, "Case 检索预览未返回结果。");
assert(Boolean(previewResponse.headers.get("server-timing")), "Case 检索预览缺少 server-timing。");
assert(Boolean(previewResponse.headers.get("ratelimit-limit")), "Case 检索预览缺少限流响应头。");
checks.push(`Case 检索预览（Top-${preview.retrieval.cases.length}）`);

const substitutionResponse = await fetchUrl("/api/ingredient-substitution", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    targetIngredient: "鸡腿肉",
    inventory: [{ name: "鸡胸肉" }, { name: "土豆" }, { name: "青椒" }],
    targetDish: "黄焖鸡",
  }),
});
assertStatus(substitutionResponse, 200, "食材替代规则");
const substitution = await substitutionResponse.json();
assert(substitution.match?.status === "adapt_recipe", "食材替代规则未返回 adapt_recipe。");
assert(substitution.match?.alternatives?.[0]?.inventoryItem === "鸡胸肉", "食材替代规则 Top-1 不符合预期。");
assert(substitution.source === "confirmed-inventory-rules", "食材替代规则缺少可审计来源。");
assert(Boolean(substitutionResponse.headers.get("server-timing")), "食材替代规则缺少 server-timing。");
checks.push("食材替代规则（鸡腿肉 -> 鸡胸肉改版）");

const eatFirstResponse = await fetchUrl("/api/eat-first", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    itemStates: [
      { name: "牛奶", status: "label_soon" },
      { name: "豆腐", status: "opened" },
      { name: "剩菜盒", status: "unknown" },
    ],
  }),
});
assertStatus(eatFirstResponse, 200, "先吃清单规则");
const eatFirst = await eatFirstResponse.json();
assert(eatFirst.eatFirst?.tonightPriority?.[0]?.name === "牛奶", "先吃清单今晚优先项不符合预期。");
assert(eatFirst.eatFirst?.soonPriority?.[0]?.name === "豆腐", "先吃清单近两餐优先项不符合预期。");
assert(eatFirst.eatFirst?.needsConfirmation?.[0]?.name === "剩菜盒", "先吃清单待确认项不符合预期。");
assert(eatFirst.source === "user-confirmed-status-rules", "先吃清单缺少可审计来源。");
assert(Boolean(eatFirstResponse.headers.get("server-timing")), "先吃清单缺少 server-timing。");
checks.push("先吃清单规则（本餐 / 近两餐 / 待确认）");

const organizationResponse = await fetchUrl("/api/fridge-organization", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    inventory: [
      { name: "鸡蛋", category: "蛋奶", notes: "门架右侧" },
      { name: "牛奶", category: "蛋奶", notes: "中层左侧" },
      { name: "豆腐", category: "其他", notes: "下层左侧" },
    ],
    itemStates: [{ name: "豆腐", status: "opened" }],
    storageConfirmations: [{ name: "鸡蛋", confirmation: "original_carton" }],
  }),
});
assertStatus(organizationResponse, 200, "冰箱粗分区规则");
const organization = await organizationResponse.json();
assert(organization.organization?.zones?.find((item) => item.name === "鸡蛋")?.approximateZone === "door", "鸡蛋粗分区不符合预期。");
assert(organization.organization?.suggestions?.[0]?.type === "move_zone", "冰箱整理 Top-1 应为满足确认条件的跨区移动。");
assert(organization.organization?.suggestions?.[0]?.suggestedZone === "middle", "鸡蛋目标分区应为中层主空间。");
assert(organization.organization?.suggestions?.length <= 3, "冰箱整理建议超过三条。");
const eggBefore = organization.organization?.layoutPreview?.before?.find((group) => group.items?.some((item) => item.name === "鸡蛋"));
const eggAfter = organization.organization?.layoutPreview?.after?.find((group) => group.items?.some((item) => item.name === "鸡蛋"));
assert(eggBefore?.zone === "door", "整理预览中的鸡蛋原分区应为门架。");
assert(eggAfter?.zone === "middle", "整理预览中的鸡蛋建议后分区应为中层。");
assert(organization.organization?.layoutPreview?.appliedSuggestionCount >= 1, "整理预览未应用满足前提的建议。");
assert(organization.source === "coarse-zone-confirmed-rules", "冰箱整理缺少可审计来源。");
assert(Boolean(organizationResponse.headers.get("server-timing")), "冰箱整理缺少 server-timing。");
checks.push("冰箱粗分区规则（条件确认 / 最多三条）");

const lifeLogInvalidResponse = await fetchUrl("/api/generate-life-log", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mealContext: { mealName: "番茄鸡蛋面" } }),
});
assertStatus(lifeLogInvalidResponse, 400, "生活记录图片输入校验");
const lifeLogInvalid = await lifeLogInvalidResponse.json();
assert(typeof lifeLogInvalid.error === "string" && lifeLogInvalid.error.includes("成品图片"), "生活记录接口缺少明确的图片输入错误。");
checks.push("生活记录接口拒绝缺失成品图的请求");

const malformedResponse = await fetchUrl("/api/case-retrieval/preview", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{",
});
assertStatus(malformedResponse, 400, "非法 JSON 防护");
const malformed = await malformedResponse.json();
assert(typeof malformed.error === "string", "非法 JSON 响应缺少可读错误。");
assert(!("stack" in malformed), "生产错误响应不应暴露 stack。");
assert(Boolean(malformedResponse.headers.get("x-request-id")), "非法 JSON 响应缺少 request ID。");
checks.push("非法 JSON 返回脱敏 400");

console.log(`Release smoke passed: ${baseUrl}`);
for (const check of checks) console.log(`PASS ${check}`);

async function checkPage(label, path, validate) {
  const response = await fetchUrl(path);
  assertStatus(response, 200, label);
  const body = await response.text();
  assert(validate(body), `${label}内容校验失败。`);
  checks.push(label);
}

async function fetchUrl(path, options) {
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`无法访问 ${baseUrl}${path}: ${error.message}`);
  }
}

function assertStatus(response, expected, label) {
  assert(response.status === expected, `${label}预期 HTTP ${expected}，实际为 ${response.status}。`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, "");
}
