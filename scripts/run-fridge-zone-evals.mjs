import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildFridgeOrganization } from "../demo/agent/fridgeZoneEngine.mjs";

const casesPath = fileURLToPath(new URL("../data/eval/fridge-zone-cases.json", import.meta.url));
const cases = JSON.parse(await readFile(casesPath, "utf8"));
let passed = 0;

for (const testCase of cases) {
  const result = buildFridgeOrganization(testCase.input);
  const zones = Object.fromEntries(result.zones.map((item) => [item.name, item.approximateZone]));
  for (const [name, expectedZone] of Object.entries(testCase.expectedZones || {})) {
    assert(zones[name] === expectedZone, `${testCase.id} ${name}: expected zone ${expectedZone}, got ${zones[name]}`);
  }

  if (Array.isArray(testCase.expectedSuggestions)) {
    const actual = result.suggestions.map(({ item, type, suggestedZone }) => ({ item, type, suggestedZone }));
    assert(
      JSON.stringify(actual) === JSON.stringify(testCase.expectedSuggestions),
      `${testCase.id} suggestions: expected ${JSON.stringify(testCase.expectedSuggestions)}, got ${JSON.stringify(actual)}`,
    );
  }
  if (Number.isInteger(testCase.expectedSuggestionCount)) {
    assert(
      result.suggestions.length === testCase.expectedSuggestionCount,
      `${testCase.id}: expected ${testCase.expectedSuggestionCount} suggestions, got ${result.suggestions.length}`,
    );
  }
  for (const expectedLayout of testCase.expectedLayout || []) {
    const before = findLayoutItem(result.layoutPreview?.before, expectedLayout.item);
    const after = findLayoutItem(result.layoutPreview?.after, expectedLayout.item);
    assert(before?.zone === expectedLayout.beforeZone, `${testCase.id} ${expectedLayout.item}: unexpected before zone`);
    assert(after?.zone === expectedLayout.afterZone, `${testCase.id} ${expectedLayout.item}: unexpected after zone`);
    assert(after?.item?.moved === expectedLayout.moved, `${testCase.id} ${expectedLayout.item}: unexpected moved flag`);
  }
  assert(result.suggestions.length <= 3, `${testCase.id}: returned more than three suggestions`);
  assert(
    !JSON.stringify(result).includes("safeToEat"),
    `${testCase.id}: must not expose a safeToEat conclusion`,
  );
  assert(
    result.warnings.some((warning) => warning.includes("不判断过期、新鲜度或是否可以安全食用")),
    `${testCase.id}: missing safety boundary`,
  );
  passed += 1;
}

console.log(`Fridge-zone eval passed: ${passed}/${cases.length}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findLayoutItem(layout, name) {
  for (const group of layout || []) {
    const item = group.items?.find((candidate) => candidate.name === name);
    if (item) return { zone: group.zone, item };
  }
  return null;
}
