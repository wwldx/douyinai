import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDemoVisionCache } from "./demoVisionCache.mjs";

const rescueModule = await import("./dishRescueAgent.mjs").catch(() => ({}));

test("taste rescue treats taste as user-reported instead of visual evidence", () => {
  assert.equal(typeof rescueModule.buildDishRescueFallback, "function");
  const result = rescueModule.buildDishRescueFallback({
    category: "taste",
    symptom: "太咸",
    description: "刚尝了一口很咸",
    dishContext: { dishName: "番茄炒蛋" },
  });

  assert.match(result.headline, /太咸/);
  assert.match(result.boundaryReminder, /味道.*用户/);
  assert.doesNotMatch(result.visualObservations.join(" "), /看出.*咸|图片.*咸/);
});

test("seasoning rescue uses incremental additions without invented exact grams", () => {
  assert.equal(typeof rescueModule.buildDishRescueFallback, "function");
  const result = rescueModule.buildDishRescueFallback({
    category: "seasoning",
    symptom: "现在该放什么",
    dishContext: { dishName: "番茄炒蛋" },
  });

  assert.match(result.actions.map((item) => item.instruction).join(" "), /少量|分次/);
  assert.doesNotMatch(JSON.stringify(result), /\d+\s*(克|g|毫升|ml)/i);
});

test("next-step rescue asks for confirmation when the stage cannot be verified", () => {
  assert.equal(typeof rescueModule.buildDishRescueFallback, "function");
  const result = rescueModule.buildDishRescueFallback({
    category: "next_step",
    symptom: "不知道下一步",
    dishContext: { dishName: "黄焖鸡", steps: ["鸡块煎香", "加水焖煮", "收汁"] },
  });

  assert.equal(result.assessment.needsConfirmation, true);
  assert.ok(result.askUser.length > 0);
  assert.ok(result.actions.length >= 1);
});

test("model next-step result is downgraded to confirmation when the user cannot name the stage", () => {
  assert.equal(typeof rescueModule.enforceDishRescueBoundaries, "function");
  const modelResult = {
    headline: "最像收汁阶段",
    assessment: { category: "next_step", confidence: "high", needsConfirmation: false },
    actions: [{ title: "先收汁", instruction: "保持中火", check: "观察液面" }],
    askUser: "",
  };

  const result = rescueModule.enforceDishRescueBoundaries(modelResult, {
    category: "next_step",
    symptom: "说不清",
    dishContext: { currentStep: "" },
  });

  assert.equal(result, modelResult);
  assert.equal(result.assessment.confidence, "medium");
  assert.equal(result.assessment.needsConfirmation, true);
  assert.ok(result.askUser.length > 0);
});

test("model instructions preserve the multimodal safety boundary", () => {
  assert.equal(typeof rescueModule.buildDishRescueInstructions, "function");
  const instructions = rescueModule.buildDishRescueInstructions({
    category: "state",
    symptom: "颜色不对",
    description: "颜色一直很浅",
    dishContext: { dishName: "红烧肉", steps: ["煸炒", "焖煮", "收汁"] },
  });

  assert.match(instructions, /不能从图片判断味道、气味、准确用量/);
  assert.match(instructions, /不能仅凭图片确认肉、蛋是否安全熟透/);
  assert.match(instructions, /原方案步骤/);
});

test("second rescue round compares the new state and does not repeat a failed action", () => {
  const instructions = rescueModule.buildDishRescueInstructions({
    category: "state",
    symptom: "太稀",
    description: "收汁后还是很稀",
    dishContext: { dishName: "番茄炒蛋" },
    followUp: {
      round: 2,
      outcome: "not_improved",
      previousHeadline: "先收一小段",
      previousAction: "转中小火观察",
      previousCheck: "锅铲划过后留下痕迹",
    },
  });
  const fallback = rescueModule.buildDishRescueFallback({
    category: "state",
    symptom: "太稀",
    dishContext: { dishName: "番茄炒蛋" },
    followUp: { round: 2, outcome: "not_improved" },
  });

  assert.match(instructions, /第 2 轮.*最后一轮复查/);
  assert.match(instructions, /不要重复上一个动作/);
  assert.match(instructions, /转中小火观察/);
  assert.match(fallback.headline, /复查/);
  assert.match(fallback.actions[0].title, /别重复/);
});

test("dish rescue seed cache requires an explicit demo key and still distinguishes the symptom", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "dish-rescue-cache-"));
  try {
    const seedDir = join(dataRoot, "demo-cache", "vision");
    await mkdir(seedDir, { recursive: true });
    await writeFile(join(seedDir, "dish-rescue.json"), JSON.stringify({
      version: 1,
      entries: [
        { fileName: "same.png", cacheKeys: ["sample-rescue-shared"], requestSignature: "state|太稀", dishRescue: { headline: "太稀" } },
        { fileName: "same.png", cacheKeys: ["sample-rescue-shared"], requestSignature: "taste|太咸", dishRescue: { headline: "太咸" } },
      ],
    }));
    const cache = createDemoVisionCache(dataRoot, { fallbackMs: 1 });

    const stateMatch = await cache.find("dishRescue", { demoKey: "sample-rescue-shared", sourceFileName: "renamed.png", category: "state", symptom: "太稀" });
    const tasteMatch = await cache.find("dishRescue", { demoKey: "sample-rescue-shared", sourceFileName: "renamed.png", category: "taste", symptom: "太咸" });
    const wrongMatch = await cache.find("dishRescue", { demoKey: "sample-rescue-shared", sourceFileName: "renamed.png", category: "state", symptom: "太干" });
    const realSameName = await cache.find("dishRescue", { sourceFileName: "same.png", category: "state", symptom: "太稀" });

    assert.equal(stateMatch?.entry?.dishRescue?.headline, "太稀");
    assert.equal(stateMatch?.matchedBy, "demoKey");
    assert.equal(tasteMatch?.entry?.dishRescue?.headline, "太咸");
    assert.equal(tasteMatch?.matchedBy, "demoKey");
    assert.equal(wrongMatch, null);
    assert.equal(realSameName, null);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("committed dish rescue samples expose stable demo keys without filename fallback", async () => {
  const dataRoot = fileURLToPath(new URL("../../data/", import.meta.url));
  const cache = createDemoVisionCache(dataRoot, { fallbackMs: 1 });

  const watery = await cache.find("dishRescue", {
    demoKey: "sample-rescue-watery",
    sourceFileName: "renamed.png",
    category: "state",
    symptom: "太稀",
  });
  const scorched = await cache.find("dishRescue", {
    demoKey: "sample-rescue-scorched",
    sourceFileName: "renamed.png",
    category: "state",
    symptom: "粘锅/糊锅",
  });
  const realSameName = await cache.find("dishRescue", {
    sourceFileName: "tomato-eggs-too-watery-demo.png",
    category: "state",
    symptom: "太稀",
  });

  assert.equal(watery?.matchedBy, "demoKey");
  assert.equal(watery?.entry?.id, "dish-rescue-watery-tomato-eggs-demo");
  assert.equal(scorched?.matchedBy, "demoKey");
  assert.equal(scorched?.entry?.id, "dish-rescue-scorched-chicken-demo");
  assert.equal(realSameName, null);
});
