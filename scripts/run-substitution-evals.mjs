import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { matchIngredientSubstitutes } from "../demo/agent/ingredientSubstitutionEngine.mjs";

const casesPath = fileURLToPath(new URL("../data/eval/ingredient-substitution-cases.json", import.meta.url));
const cases = JSON.parse(await readFile(casesPath, "utf8"));
let passed = 0;

for (const testCase of cases) {
  const result = matchIngredientSubstitutes({
    targetIngredient: testCase.targetIngredient,
    inventory: testCase.inventory.map((name) => ({ name })),
    targetDish: "评测菜品",
  });

  const top = result.exactMatch || result.alternatives[0]?.inventoryItem || "";
  const statusPassed = result.status === testCase.expectedStatus;
  const topPassed = !testCase.expectedTop || top === testCase.expectedTop;
  const safetyPassed = result.warnings.some((warning) => warning.includes("不判断新鲜度"));

  if (!statusPassed || !topPassed || !safetyPassed) {
    throw new Error(`${testCase.id} failed: expected ${testCase.expectedStatus}/${testCase.expectedTop || "-"}, got ${result.status}/${top || "-"}`);
  }
  passed += 1;
}

console.log(`Ingredient substitution eval passed: ${passed}/${cases.length}`);

