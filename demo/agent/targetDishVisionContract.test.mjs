import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { targetDishVisionSchema } from "./schemas.mjs";
import { analyzeTargetDish } from "./targetDishVisionAgent.mjs";
import {
  normalizeTargetDishVisionContract,
  normalizeTargetDishVisionModelResult,
} from "./targetDishVisionContract.mjs";

function option(name, details = {}) {
  return {
    id: `model-${name}`,
    name,
    likelyIngredients: details.ingredients || [`${name}主料`],
    estimatedTime: details.time || "30 分钟",
    difficulty: details.difficulty || "中等",
    requiredTools: details.tools || ["炒锅"],
    warnings: details.warnings || [],
    provenance: "vision",
  };
}

test("target dish schema exposes complete dishOptions while retaining legacy fields", () => {
  assert.ok(targetDishVisionSchema.required.includes("dishOptions"));
  assert.equal(targetDishVisionSchema.properties.dishOptions.maxItems, 4);
  assert.deepEqual(
    targetDishVisionSchema.properties.dishOptions.items.required,
    ["id", "name", "likelyIngredients", "estimatedTime", "difficulty", "requiredTools", "warnings", "provenance"],
  );
});

test("normalizer keeps each candidate's own details and synchronizes legacy primary fields", () => {
  const result = normalizeTargetDishVisionContract({
    dishName: "旧主候选",
    dishNameCandidates: ["旧次候选"],
    dishOptions: [
      option("黄焖鸡", { ingredients: ["鸡腿肉", "香菇"], time: "35-45 分钟", tools: ["带盖炒锅"] }),
      option("土豆焖鸡", { ingredients: ["鸡腿肉", "土豆"], time: "30-40 分钟", tools: ["炖锅"] }),
    ],
    optionalIngredients: ["葱"],
    warnings: ["旧提醒"],
  });

  assert.equal(result.dishName, "黄焖鸡");
  assert.deepEqual(result.dishNameCandidates, ["土豆焖鸡"]);
  assert.deepEqual(result.likelyIngredients, ["鸡腿肉", "香菇"]);
  assert.deepEqual(result.requiredTools, ["带盖炒锅"]);
  assert.deepEqual(result.dishOptions[1].likelyIngredients, ["鸡腿肉", "土豆"]);
  assert.equal(result.dishOptions[1].estimatedTime, "30-40 分钟");
  assert.deepEqual(result.dishOptions[1].requiredTools, ["炖锅"]);
  assert.notEqual(result.dishOptions[0].id, result.dishOptions[1].id);
});

test("normalizer deduplicates names, rejects placeholders and caps credible options at four", () => {
  const result = normalizeTargetDishVisionContract({
    dishName: "黄焖鸡",
    dishOptions: [
      option("黄焖鸡"),
      option("黄焖鸡"),
      option("未知菜品"),
      option("香菇焖鸡"),
      option("土豆焖鸡"),
      option("鸡块烧土豆"),
      option("干锅鸡块"),
    ],
  });
  assert.deepEqual(result.dishOptions.map((item) => item.name), ["黄焖鸡", "香菇焖鸡", "土豆焖鸡", "鸡块烧土豆"]);
});

test("explicit empty contract does not fall back to a legacy dish name", () => {
  const result = normalizeTargetDishVisionContract({
    dishName: "黄焖鸡",
    dishNameCandidates: ["香菇焖鸡"],
    dishOptions: [],
    likelyIngredients: ["鸡腿肉"],
  });
  assert.equal(result.dishName, "");
  assert.deepEqual(result.dishNameCandidates, []);
  assert.deepEqual(result.dishOptions, []);
  assert.deepEqual(result.likelyIngredients, []);
});

test("model contract accepts explicit empty candidates but rejects missing or unusable candidates", () => {
  assert.deepEqual(normalizeTargetDishVisionModelResult({ dishName: "", dishOptions: [] }).dishOptions, []);
  assert.throws(
    () => normalizeTargetDishVisionModelResult({ dishName: "回锅肉" }),
    (error) => error.code === "MODEL_RESPONSE_INVALID",
  );
  assert.throws(
    () => normalizeTargetDishVisionModelResult({ dishName: "", dishOptions: [{ name: "回锅肉" }] }),
    (error) => error.code === "MODEL_RESPONSE_INVALID",
  );
});

test("target dish vision allows forty seconds for the expanded candidate contract", async () => {
  let capturedRequest;
  const modelClient = {
    async createJsonResponse(request) {
      capturedRequest = request;
      return { dishName: "", dishOptions: [] };
    },
  };
  await analyzeTargetDish("data:image/jpeg;base64,dGVzdA==", modelClient);
  assert.equal(capturedRequest.timeoutMs, 40_000);
});

test("legacy response creates only one primary option and ignores detail-less secondary names", () => {
  const result = normalizeTargetDishVisionContract({
    dishName: "回锅肉",
    dishNameCandidates: ["川味五花肉小炒", "青椒炒肉"],
    likelyIngredients: ["五花肉", "豆瓣酱"],
    estimatedTime: "35-45 分钟",
    difficulty: "中等偏难",
    requiredTools: ["炒锅"],
    warnings: [],
  });
  assert.equal(result.dishOptions.length, 1);
  assert.equal(result.dishOptions[0].name, "回锅肉");
  assert.deepEqual(result.dishNameCandidates, []);
});

test("normalizer preserves non-enumerable symbol metadata", () => {
  const meta = Symbol("model-meta");
  const raw = { dishOptions: [option("黄焖鸡")] };
  Object.defineProperty(raw, meta, { value: { usage: { total_tokens: 123 } }, enumerable: false });
  const result = normalizeTargetDishVisionContract(raw);
  assert.deepEqual(result[meta], { usage: { total_tokens: 123 } });
});

test("controlled target dish caches carry real complete options without forced four", async () => {
  const payload = JSON.parse(await readFile(new URL("../../data/demo-cache/vision/target-dishes.json", import.meta.url), "utf8"));
  assert.equal(payload.entries.length, 2);
  assert.ok(payload.entries.find((entry) => entry.id === "dish-huiguorou")?.cacheKeys?.includes("sample-dish-huiguorou"));
  for (const entry of payload.entries) {
    const vision = entry.targetVision;
    assert.ok(vision.dishOptions.length >= 1 && vision.dishOptions.length <= 4);
    assert.equal(vision.dishOptions[0].name, vision.dishName);
    assert.deepEqual(vision.dishOptions.slice(1).map((item) => item.name), vision.dishNameCandidates);
    assert.equal(new Set(vision.dishOptions.map((item) => item.name)).size, vision.dishOptions.length);
    for (const candidate of vision.dishOptions) {
      assert.ok(candidate.id && candidate.name && candidate.estimatedTime && candidate.difficulty);
      assert.ok(candidate.likelyIngredients.length > 0);
      assert.ok(candidate.requiredTools.length > 0);
      assert.equal(candidate.provenance, "vision");
    }
  }
  assert.equal(payload.entries[1].targetVision.dishOptions.length, 2, "回锅肉只有两个可信候选，不能凑满四个");
});
