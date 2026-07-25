import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildEatFirstList } from "../demo/agent/eatFirstEngine.mjs";

const casesPath = fileURLToPath(new URL("../data/eval/eat-first-cases.json", import.meta.url));
const cases = JSON.parse(await readFile(casesPath, "utf8"));
let passed = 0;

for (const testCase of cases) {
  const result = buildEatFirstList({ itemStates: testCase.itemStates });
  assertNames(testCase.id, "tonightPriority", result.tonightPriority, testCase.expectedTonight);
  assertNames(testCase.id, "soonPriority", result.soonPriority, testCase.expectedSoon);
  assertNames(testCase.id, "needsConfirmation", result.needsConfirmation, testCase.expectedNeeds);
  if (!result.warnings.some((warning) => warning.includes("不代表食材未过期"))) {
    throw new Error(`${testCase.id} missing safety warning`);
  }
  if (result.summary.includes("今晚")) {
    throw new Error(`${testCase.id} summary should remain meal-slot neutral`);
  }
  passed += 1;
}

console.log(`Eat-first eval passed: ${passed}/${cases.length}`);

function assertNames(id, field, actualItems, expectedNames) {
  const actualNames = actualItems.map((item) => item.name);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${id} ${field}: expected ${JSON.stringify(expectedNames)}, got ${JSON.stringify(actualNames)}`);
  }
}
