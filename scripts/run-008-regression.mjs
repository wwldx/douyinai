import assert from "node:assert/strict";
import { sanitizeFridgeVision } from "../demo/agent/fridgeVisionSanitizer.mjs";
import { deriveUnknownCoverageStatus, resolveRequiredCoverage } from "../frontend/src/lib/targetCoverage.js";

const screenshotVision = {
  items: [
    { name: "杯装酸奶/乳酸菌饮品", category: "蛋奶" },
    { name: "保温水瓶", category: "其他" },
    { name: "白色袋装食材", category: "其他" },
    { name: "袋装禽肉或肉类食材", category: "肉类", notes: "冷冻区下层" },
    { name: "面包/饼类包装食品", category: "主食", notes: "冷藏室门架" },
    { name: "黑色锅具", category: "其他" },
  ],
  uncertainItems: [],
  warnings: [],
};

const sanitized = sanitizeFridgeVision(screenshotVision);
assert.deepEqual(sanitized.vision.items.map((item) => item.name), ["杯装酸奶/乳酸菌饮品"]);
assert.deepEqual(sanitized.diagnostics.filteredNonFood, ["保温水瓶", "黑色锅具"]);
assert.deepEqual(sanitized.diagnostics.movedToUncertain, ["白色袋装食材", "袋装禽肉或肉类食材", "面包/饼类包装食品"]);
assert.equal(sanitized.vision.uncertainItems[1].reason.includes("冷冻区下层"), true);
assert.equal(sanitized.vision.uncertainItems[2].reason.includes("冷藏室门架"), true);

const lambNoodlesMissing = resolveRequiredCoverage(
  ["羊肉", "烩面片"],
  sanitized.vision.items,
);
assert.equal(lambNoodlesMissing.coverageStatus, "missing");
assert.deepEqual(lambNoodlesMissing.missingCritical, ["羊肉", "烩面片"]);

const lambNoodlesEnough = resolveRequiredCoverage(
  ["羊肉", "烩面片"],
  [{ name: "羊肉片" }, { name: "宽面片" }],
);
assert.equal(lambNoodlesEnough.coverageStatus, "enough");
assert.equal(deriveUnknownCoverageStatus([]), "unresolved");
assert.equal(deriveUnknownCoverageStatus(["关键主料"]), "unresolved");
assert.equal(deriveUnknownCoverageStatus(["牛肉"]), "missing");

console.log("008 targeted regression: 9 assertions passed");
