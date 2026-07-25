import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCaseRetriever } from "../demo/agent/caseRetriever.mjs";

const dataRoot = fileURLToPath(new URL("../data", import.meta.url));
const referencePayload = JSON.parse(await readFile(new URL("../data/case-memory/reference-cases.json", import.meta.url), "utf8"));
const labelPayload = JSON.parse(await readFile(new URL("../data/case-memory/retrieval-labels.json", import.meta.url), "utf8"));

validateReferences(referencePayload.cases);
validateLabels(labelPayload.labels);

const retriever = createCaseRetriever(dataRoot);
const results = [];

for (const label of labelPayload.labels) {
  const retrieval = await retriever.retrieve({
    route: label.route,
    targetDish: label.targetDish || null,
    inventory: label.inventory.map((name) => ({ name })),
    userContext: {
      user: {
        cookingLevel: label.cookingLevel,
        preferences: label.preferences || [],
        avoid: [],
      },
      context: {
        availableCookingTime: label.availableTime,
        energyLevel: label.energyLevel,
      },
    },
  }, { mode: "contrast", limit: 4 });

  const rankedIds = retrieval.cases.map((item) => item.caseId);
  const firstRelevantIndex = rankedIds.findIndex((caseId) => label.expectedCaseIds.includes(caseId));
  results.push({
    queryId: label.queryId,
    expected: label.expectedCaseIds,
    retrieved: rankedIds,
    hitAt4: firstRelevantIndex >= 0,
    reciprocalRank: firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0,
  });
}

const recallAt4 = results.filter((item) => item.hitAt4).length / results.length;
const mrrAt4 = results.reduce((sum, item) => sum + item.reciprocalRank, 0) / results.length;

console.log(`Reference cases: ${referencePayload.cases.length}`);
console.log(`Retrieval labels: ${results.length}`);
console.log(`Recall@4: ${(recallAt4 * 100).toFixed(1)}%`);
console.log(`MRR@4: ${mrrAt4.toFixed(3)}`);
for (const item of results) {
  console.log(`${item.hitAt4 ? "PASS" : "FAIL"} ${item.queryId} expected=${item.expected.join("|")} retrieved=${item.retrieved.join(",")}`);
}

if (recallAt4 < 0.875) {
  process.exitCode = 1;
}

function validateReferences(cases) {
  if (!Array.isArray(cases) || cases.length < 24) throw new Error("参考 Case 至少需要 24 条。");
  const ids = new Set();
  let positiveCount = 0;
  let negativeCount = 0;
  for (const item of cases) {
    if (!item.caseId || ids.has(item.caseId)) throw new Error(`Case ID 缺失或重复：${item.caseId || "unknown"}`);
    ids.add(item.caseId);
    if (item.source !== "curated") throw new Error(`${item.caseId} source 必须明确为 curated。`);
    if (!Array.isArray(item.inventory) || !item.constraints || !item.decision) throw new Error(`${item.caseId} 结构不完整。`);
    if (item.satisfaction === "rejected") negativeCount += 1;
    else if (item.satisfaction === "accepted") positiveCount += 1;
    else throw new Error(`${item.caseId} satisfaction 非法。`);
  }
  if (!positiveCount || !negativeCount) throw new Error("参考 Case 必须同时包含正例和反例。");
}

function validateLabels(labels) {
  if (!Array.isArray(labels) || labels.length < 8) throw new Error("检索标签至少需要 8 条。");
  for (const label of labels) {
    if (!label.queryId || !Array.isArray(label.inventory) || !Array.isArray(label.expectedCaseIds) || !label.expectedCaseIds.length) {
      throw new Error(`检索标签结构不完整：${label.queryId || "unknown"}`);
    }
  }
}
