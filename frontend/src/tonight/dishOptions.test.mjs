import assert from "node:assert/strict";
import test from "node:test";
import {
  SAMPLE_DISHES,
  classifyDishVisionError,
  dishOptionsFromAnalysis,
  nextSampleDish,
  restoreDishOptionSelection,
} from "./model.js";

function option(id, name, ingredient, time, tool, provenance = "vision") {
  return {
    id,
    name,
    likelyIngredients: [ingredient],
    estimatedTime: time,
    difficulty: "中等",
    requiredTools: [tool],
    warnings: [],
    provenance,
  };
}

test("frontend binds selected id to that option's own details", () => {
  const analysis = {
    dishOptions: [
      option("a", "黄焖鸡", "香菇", "35-45 分钟", "带盖炒锅"),
      option("b", "土豆焖鸡", "土豆", "30-40 分钟", "炖锅"),
    ],
  };
  const restored = restoreDishOptionSelection(analysis, { id: "b", name: "旧名字", likelyIngredients: ["错误材料"] });
  assert.equal(restored.name, "土豆焖鸡");
  assert.deepEqual(restored.likelyIngredients, ["土豆"]);
  assert.equal(restored.estimatedTime, "30-40 分钟");
  assert.deepEqual(restored.requiredTools, ["炖锅"]);
});

test("frontend never builds secondary candidates from legacy name-only fields", () => {
  const options = dishOptionsFromAnalysis({
    dishName: "回锅肉",
    dishNameCandidates: ["川味五花肉小炒"],
    likelyIngredients: ["五花肉"],
    estimatedTime: "35-45 分钟",
    difficulty: "中等偏难",
    requiredTools: ["炒锅"],
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].name, "回锅肉");
});

test("frontend honors explicit empty options and rejects checkpoint-one prototype recovery", () => {
  assert.deepEqual(dishOptionsFromAnalysis({ dishName: "黄焖鸡", dishOptions: [] }), []);
  const prototypeAnalysis = {
    dishOptions: [option("prototype-huangmenji", "黄焖鸡", "鸡腿肉", "35-45 分钟", "带盖炒锅", "checkpoint1-controlled-fixture")],
  };
  assert.deepEqual(dishOptionsFromAnalysis(prototypeAnalysis), []);
  assert.equal(restoreDishOptionSelection(prototypeAnalysis, prototypeAnalysis.dishOptions[0]), null);
});

test("frontend separates target vision timeout, network and invalid response errors", () => {
  assert.equal(classifyDishVisionError({ code: "MODEL_TIMEOUT", status: 504 }).kind, "timeout");
  assert.equal(classifyDishVisionError({ code: "CLIENT_TIMEOUT" }).kind, "timeout");
  assert.equal(classifyDishVisionError({ code: "MODEL_CONNECT_ERROR", status: 502 }).kind, "network");
  assert.equal(classifyDishVisionError({ code: "NETWORK_ERROR" }).kind, "network");
  assert.equal(classifyDishVisionError({ code: "MODEL_RESPONSE_INVALID", status: 502 }).kind, "invalid_response");
  assert.equal(classifyDishVisionError({ code: "INVALID_RESPONSE" }).kind, "invalid_response");
});

test("local dish samples cycle with independent controlled demo keys", () => {
  assert.deepEqual(SAMPLE_DISHES.map((sample) => sample.demoKey), [
    "sample-dish-huangmenji",
    "sample-dish-huiguorou",
  ]);
  assert.equal(nextSampleDish("sample-dish-huangmenji").fileName, "回锅肉.jpeg");
  assert.equal(nextSampleDish("sample-dish-huiguorou").fileName, "黄焖鸡-示例.png");
});
