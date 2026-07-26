import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function standardModelPlan() {
  return {
    planContext: { planningMode: "inventory_adapted", inventoryStatus: "confirmed" },
    targetDish: {
      name: "回锅肉",
      intentTime: "tonight",
      coreTaste: "咸香微辣",
      estimatedTime: "约 40 分钟",
      difficulty: "中等",
    },
    targetAssessment: {
      status: "confirmed_food",
      reason: "这是明确的家常菜。",
      clarificationPrompt: "",
    },
    verdict: {
      title: "按标准条件生成回锅肉",
      summary: "尚未核对家中材料，以下按标准材料准备。",
      primaryAction: "cook_now",
    },
    standardIngredients: ["五花肉", "蒜苗", "豆瓣酱", "生抽", "食用油"],
    inventoryMatch: {
      availableItems: ["错误已有项"],
      missingCritical: ["错误缺料项"],
      missingOptional: [],
      substitutions: [],
    },
    shoppingPlan: {
      mustBuy: [{ item: "错误商品", reason: "用于验证后处理清空" }],
      confirmAtHome: ["盐"],
      optionalUpgrades: [],
    },
    executionPlan: {
      isExecutableNow: true,
      dishName: "回锅肉",
      blockReason: "none",
      recommendedVersion: "标准回锅肉",
      steps: ["五花肉煮至定型后放凉切片。", "小火煸出油脂并加入豆瓣酱。", "加入蒜苗和调味料快速翻炒出锅。"],
      difficultyWarnings: ["生肉状态和熟度由用户自行确认。"],
      prepForTomorrow: "",
    },
    userFit: {
      skillNote: "按新手可跟随的顺序拆解。",
      timeNote: "15 分钟预算短于约 40 分钟的现实耗时。",
      profileNotes: ["保留用户确认的目标菜。"],
    },
    commerceCards: [{
      type: "douyin_mall",
      title: "错误商城卡",
      item: "错误商品",
      reason: "用于验证后处理清空",
      cta: "加入",
    }],
    talkTrack: "标准做法不代表家中材料已经齐备。",
  };
}

async function listenOnFreePort(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function reservePort() {
  const probe = createServer();
  const port = await listenOnFreePort(probe);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("本地测试服务启动超时。")), 5_000);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`本地测试服务提前退出 (${code})：${stderr}`));
    });
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("冰箱晚餐 Agent demo")) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("plan-target-dish route supports standard null inventory and rejects illegal combinations", async (t) => {
  const upstreamRequests = [];
  const upstream = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    upstreamRequests.push({ url: req.url, body: JSON.parse(raw) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      model: "planner-test-model",
      output: [{
        content: [{ type: "output_text", text: JSON.stringify(standardModelPlan()) }],
      }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }));
  });
  const upstreamPort = await listenOnFreePort(upstream);
  t.after(() => new Promise((resolve) => upstream.close(() => resolve())));

  const appPort = await reservePort();
  const runtimeDataRoot = await mkdtemp(join(tmpdir(), "fridge-planner-server-test-"));
  const child = spawn(process.execPath, ["demo/server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      DATA_DIR: runtimeDataRoot,
      OPENAI_API_KEY: "sk-local-test-123",
      OPENAI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      MODEL_PROVIDER: "openai_responses",
      OPENAI_MODEL: "planner-test-model",
      PLANNING_MODEL: "planner-test-model",
      CASE_RETRIEVAL_MODE: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await rm(runtimeDataRoot, { recursive: true, force: true });
  });
  await waitForServer(child);

  const baseUrl = `http://127.0.0.1:${appPort}`;
  const standardResponse = await fetch(`${baseUrl}/api/plan-target-dish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      planningMode: "standard_recipe",
      inventoryStatus: "not_checked",
      inventory: null,
      targetDish: {
        text: "回锅肉",
        nameSource: "vision_primary",
        nameConfirmed: true,
        intentTime: "tonight",
        imageAnalysis: null,
        shoppingDecision: { mode: "simulate_after_purchase", acceptedItems: ["五花肉"] },
      },
      userContext: {
        user: { cookingLevel: "新手", preferences: [], avoid: [], goal: "做回锅肉" },
        context: { availableCookingTime: "15 分钟" },
      },
      retrievalMode: "positive",
    }),
  });
  const standardPayload = await standardResponse.json();

  assert.equal(standardResponse.status, 200);
  assert.equal(standardPayload.requestId, standardResponse.headers.get("x-request-id"));
  assert.equal(standardPayload.source, "model");
  assert.deepEqual(standardPayload.targetPlan.planContext, {
    planningMode: "standard_recipe",
    inventoryStatus: "not_checked",
  });
  assert.equal(standardPayload.retrieval.mode, "off");
  assert.equal(standardPayload.retrieval.skippedReason, "inventory_not_checked");
  assert.deepEqual(standardPayload.targetPlan.inventoryMatch.missingCritical, []);
  assert.deepEqual(standardPayload.targetPlan.shoppingPlan.mustBuy, []);
  assert.deepEqual(standardPayload.targetPlan.commerceCards, []);
  assert.equal(standardPayload.targetPlan.executionPlan.dishName, "回锅肉");
  assert.equal(standardPayload.targetPlan.executionPlan.steps.length, 3);
  assert.equal(standardPayload.targetPlan.executionPlan.isExecutableNow, false);
  assert.equal(standardPayload.targetPlan.executionPlan.blockReason, "needs_confirmation");
  assert.equal(upstreamRequests.length, 1);
  const plannerInput = JSON.parse(upstreamRequests[0].body.input[0].content[0].text);
  assert.equal(plannerInput.inventory, null);
  assert.deepEqual(plannerInput.planContext, standardPayload.targetPlan.planContext);
  assert.equal(plannerInput.targetDish.shoppingDecision, null);
  assert.deepEqual(plannerInput.commerceCatalog, []);

  const legacyResponse = await fetch(`${baseUrl}/api/plan-target-dish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inventory: [{ name: "五花肉", category: "蛋白质", state: "用户已确认" }],
      targetDish: { text: "回锅肉", intentTime: "tonight", imageAnalysis: null },
      userContext: { user: { cookingLevel: "新手" }, context: { availableCookingTime: "40 分钟" } },
    }),
  });
  const legacyPayload = await legacyResponse.json();
  assert.equal(legacyResponse.status, 200);
  assert.deepEqual(legacyPayload.targetPlan.planContext, {
    planningMode: "inventory_adapted",
    inventoryStatus: "confirmed",
  });
  assert.deepEqual(legacyPayload.targetPlan.standardIngredients, []);
  const legacyPlannerInput = JSON.parse(upstreamRequests[1].body.input[0].content[0].text);
  assert.equal(Array.isArray(legacyPlannerInput.inventory), true);
  assert.equal(legacyPlannerInput.inventory.length, 1);

  const invalidBodies = [
    { planningMode: "standard_recipe", inventoryStatus: "not_checked", inventory: [] },
    { planningMode: "standard_recipe", inventoryStatus: "confirmed", inventory: null },
    { planningMode: "inventory_adapted", inventoryStatus: "not_checked", inventory: [] },
    { planningMode: "inventory_adapted", inventoryStatus: "confirmed", inventory: [] },
    { planningMode: "inventory_adapted", inventoryStatus: "confirmed_empty", inventory: [{ name: "鸡蛋" }] },
  ];
  for (const invalid of invalidBodies) {
    const response = await fetch(`${baseUrl}/api/plan-target-dish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...invalid,
        targetDish: { text: "回锅肉", intentTime: "tonight" },
        userContext: {},
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.requestId, response.headers.get("x-request-id"));
  }
  assert.equal(upstreamRequests.length, 2, "非法请求必须在调用模型前被拒绝");
});
