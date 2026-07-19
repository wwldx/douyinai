import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MODE_VALUES = new Set(["off", "positive", "contrast"]);

const DISH_KNOWLEDGE = [
  { pattern: /黄焖鸡/, tags: ["鸡肉", "焖菜", "下饭"], required: ["鸡肉", "香菇"] },
  { pattern: /宫保鸡丁/, tags: ["鸡肉", "快炒", "下饭"], required: ["鸡肉", "花生"] },
  { pattern: /鱼香肉丝/, tags: ["猪肉", "快炒", "下饭"], required: ["猪肉", "木耳"] },
  { pattern: /番茄.*牛腩|牛腩/, tags: ["牛肉", "炖菜", "下饭"], required: ["牛肉", "番茄"] },
  { pattern: /可乐鸡翅|鸡翅/, tags: ["鸡肉", "焖菜", "下饭"], required: ["鸡翅"] },
  { pattern: /蛋炒饭|炒饭/, tags: ["鸡蛋", "米饭", "快手"], required: ["鸡蛋", "米饭"] },
  { pattern: /番茄.*鸡蛋.*面|西红柿.*鸡蛋.*面/, tags: ["鸡蛋", "面条", "快手"], required: ["鸡蛋", "番茄", "面条"] },
  { pattern: /麻婆豆腐/, tags: ["豆腐", "快炒", "下饭"], required: ["豆腐"] },
  { pattern: /沙拉|轻食/, tags: ["蔬菜", "轻食", "清淡"], required: ["蔬菜"] },
  { pattern: /粥/, tags: ["主食", "清淡", "低负担"], required: ["米"] },
];

const INGREDIENT_ALIASES = new Map([
  ["西红柿", "番茄"],
  ["鸡腿肉", "鸡肉"],
  ["鸡胸肉", "鸡肉"],
  ["鸡腿", "鸡肉"],
  ["牛腩", "牛肉"],
  ["五花肉", "猪肉"],
  ["肉片", "猪肉"],
  ["香菇", "菌菇"],
  ["蘑菇", "菌菇"],
  ["青菜", "蔬菜"],
  ["生菜", "蔬菜"],
  ["菠菜", "蔬菜"],
  ["剩饭", "米饭"],
  ["挂面", "面条"],
]);

export function normalizeRetrievalMode(value, fallback = "off") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return MODE_VALUES.has(normalized) ? normalized : fallback;
}

export function createCaseRetriever(dataRoot) {
  const referencePath = join(dataRoot, "case-memory", "reference-cases.json");
  let casesPromise;

  async function loadCases() {
    casesPromise ||= readFile(referencePath, "utf8").then((text) => {
      const payload = JSON.parse(text);
      if (!Array.isArray(payload.cases)) throw new Error("reference-cases.json 缺少 cases 数组。");
      return payload.cases;
    });
    return casesPromise;
  }

  return {
    loadCases,
    async retrieve(input, options = {}) {
      const mode = normalizeRetrievalMode(options.mode, "off");
      const limit = Math.min(8, Math.max(1, Number(options.limit) || 4));
      if (mode === "off") return { mode, query: buildCaseQuery(input), cases: [] };

      const references = await loadCases();
      const query = buildCaseQuery(input);
      const ranked = references
        .filter((item) => item.caseId !== options.excludeCaseId)
        .map((item) => scoreReferenceCase(query, item))
        .sort((a, b) => b.similarity - a.similarity || a.caseId.localeCompare(b.caseId));

      const selected = selectByMode(ranked, mode, limit);
      return {
        mode,
        query,
        cases: selected.map((item) => ({
          ...item,
          similarity: Number(item.similarity.toFixed(4)),
          scoreBreakdown: Object.fromEntries(
            Object.entries(item.scoreBreakdown).map(([key, value]) => [key, Number(value.toFixed(4))]),
          ),
        })),
      };
    },
  };
}

export function buildCaseQuery({ inventory = [], targetDish = null, userContext = {}, route } = {}) {
  const inventoryNames = normalizeIngredientList(inventory.map((item) => (typeof item === "string" ? item : item?.name)));
  const targetText = String(targetDish?.text || targetDish?.name || "").trim();
  const dishKnowledge = DISH_KNOWLEDGE.find((item) => item.pattern.test(targetText));
  const visualIngredients = normalizeIngredientList(targetDish?.imageAnalysis?.likelyIngredients || []);
  const required = normalizeIngredientList([...(dishKnowledge?.required || []), ...visualIngredients]);
  const inventorySet = new Set(inventoryNames);
  const missingCritical = required.filter((item) => !inventorySet.has(item));
  const preferences = normalizeTextList([
    ...(userContext.user?.preferences || []),
    ...(userContext.user?.avoid || []),
    ...(userContext.profile?.traits || []).map((trait) => trait.key || trait.label),
  ]);

  return {
    scene: route || (targetText ? "feed_to_fridge" : "fridge_first"),
    targetDishTags: dishKnowledge?.tags || (targetText ? tokenizeText(targetText) : ["无指定菜"]),
    inventory: inventoryNames,
    missingCritical,
    timeBucket: timeBucket(userContext.context?.availableCookingTime),
    skill: normalizeSkill(userContext.user?.cookingLevel),
    energy: normalizeEnergy(userContext.context?.energyLevel),
    preferences,
  };
}

export function scoreReferenceCase(query, reference) {
  const targetDishTags = normalizeTextList(reference.targetDish?.tags || ["无指定菜"]);
  const inventory = normalizeIngredientList(reference.inventory || []);
  const missingCritical = normalizeIngredientList(reference.missingCritical || []);
  const constraints = reference.constraints || {};
  const target = jaccard(query.targetDishTags, targetDishTags);
  const inventoryScore = jaccard(query.inventory, inventory);
  const missing = emptyAwareSimilarity(query.missingCritical, missingCritical);
  const time = query.timeBucket === timeBucket(constraints.timeMinutes) ? 1 : 0;
  const skill = query.skill === normalizeSkill(constraints.skill) ? 1 : 0;
  const energy = query.energy === normalizeEnergy(constraints.energy) ? 1 : 0;
  const skillEnergy = (skill + energy) / 2;
  const preference = emptyAwareSimilarity(query.preferences, normalizeTextList(constraints.preferences || []));
  const scoreBreakdown = { target, inventory: inventoryScore, missing, time, skillEnergy, preference };
  const similarity = 0.30 * target
    + 0.30 * inventoryScore
    + 0.15 * missing
    + 0.10 * time
    + 0.10 * skillEnergy
    + 0.05 * preference;

  return {
    caseId: reference.caseId,
    source: reference.source,
    role: reference.satisfaction === "rejected" ? "negative" : "positive",
    similarity,
    scoreBreakdown,
    sharedEvidence: buildSharedEvidence(query, reference),
    decision: reference.decision,
    evidence: reference.evidence || [],
    lesson: reference.lesson || "",
  };
}

export function toPlannerCases(retrieval) {
  return (retrieval?.cases || []).map((item) => ({
    caseId: item.caseId,
    similarity: item.similarity,
    role: item.role,
    sharedEvidence: item.sharedEvidence,
    decision: item.decision,
    evidence: item.evidence,
    lesson: item.lesson,
  }));
}

function selectByMode(ranked, mode, limit) {
  if (mode === "positive") return ranked.filter((item) => item.role === "positive").slice(0, limit);

  const positive = ranked.find((item) => item.role === "positive");
  const negative = ranked.find((item) => item.role === "negative");
  const selected = [positive, negative].filter(Boolean);
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (!selected.some((selectedItem) => selectedItem.caseId === item.caseId)) selected.push(item);
  }
  return selected;
}

function buildSharedEvidence(query, reference) {
  const sharedInventory = intersection(query.inventory, normalizeIngredientList(reference.inventory || []));
  const sharedMissing = intersection(query.missingCritical, normalizeIngredientList(reference.missingCritical || []));
  const evidence = [];
  if (sharedInventory.length) evidence.push(`共同库存：${sharedInventory.join("、")}`);
  if (sharedMissing.length) evidence.push(`共同缺料：${sharedMissing.join("、")}`);
  if (query.timeBucket === timeBucket(reference.constraints?.timeMinutes)) evidence.push(`同为${query.timeBucket}时间预算`);
  if (query.skill === normalizeSkill(reference.constraints?.skill)) evidence.push(`同为${query.skill}厨艺`);
  if (query.energy === normalizeEnergy(reference.constraints?.energy)) evidence.push(`同为${query.energy}精力`);
  return evidence.slice(0, 4);
}

function normalizeIngredientList(values) {
  return [...new Set(values.map((value) => normalizeIngredient(value)).filter(Boolean))];
}

function normalizeIngredient(value) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  if (!text) return "";
  for (const [alias, normalized] of INGREDIENT_ALIASES) {
    if (text.includes(alias) || alias.includes(text)) return normalized;
  }
  return text;
}

function normalizeTextList(values) {
  return [...new Set(values.flatMap((value) => tokenizeText(value)).filter(Boolean))];
}

function tokenizeText(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s,，、;；|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function timeBucket(value) {
  const minutes = Number(String(value || "").match(/\d+/)?.[0] || value || 0);
  if (minutes > 0 && minutes <= 15) return "短时";
  if (minutes > 0 && minutes <= 30) return "中等";
  return "充足";
}

function normalizeSkill(value) {
  const text = String(value || "").toLowerCase();
  if (/新手|beginner/.test(text)) return "新手";
  if (/入门|intermediate/.test(text)) return "入门";
  return "熟练";
}

function normalizeEnergy(value) {
  const text = String(value || "").toLowerCase();
  if (/低|low/.test(text)) return "低";
  if (/高|high/.test(text)) return "高";
  return "中";
}

function emptyAwareSimilarity(left, right) {
  if (!left.length && !right.length) return 1;
  return jaccard(left, right);
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size && !b.size) return 1;
  const shared = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? shared / union : 0;
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}
