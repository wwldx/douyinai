import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FEEDBACK_OPTIONS = [
  { label: "想吃", eventType: "accept_meal" },
  { label: "太麻烦", eventType: "too_complex" },
  { label: "缺料太多", eventType: "too_many_missing" },
  { label: "不够抗饿", eventType: "not_filling" },
  { label: "不想洗锅", eventType: "low_cleanup" },
  { label: "换清淡点", eventType: "lighter_taste" },
  { label: "今天就想外卖", eventType: "delivery_today" },
];

export function createUserMemoryStore(dataRoot, runtimeDataRoot = dataRoot) {
  const seedDir = join(dataRoot, "demo-users");
  const localDir = join(runtimeDataRoot, "local-users");

  return {
    listUsers: () => listUsers(seedDir, localDir),
    getUserState: (userId) => getUserState(seedDir, localDir, userId),
    recordFeedback: (userId, feedback) => recordFeedback(seedDir, localDir, userId, feedback),
    getVisionCache: (userId) => getVisionCache(seedDir, localDir, userId),
    saveVisionCache: (userId, cache) => saveVisionCache(seedDir, localDir, userId, cache),
  };
}

async function listUsers(seedDir, localDir) {
  const seeds = await readSeedUsers(seedDir);
  await mkdir(localDir, { recursive: true });

  return seeds.map((seed) => ({
    id: seed.id,
    name: seed.name,
    label: seed.label,
    description: seed.description,
  }));
}

async function getUserState(seedDir, localDir, userId) {
  const user = await ensureLocalUser(seedDir, localDir, userId);
  const profile = normalizeProfile(user.profile, user.userContext);
  profile.traits = deriveTraits(profile, user.userContext);

  user.profile = profile;
  await saveLocalUser(localDir, user);

  return {
    id: user.id,
    name: user.name,
    label: user.label,
    description: user.description,
    userContext: buildUserContext(user),
    profile,
  };
}

async function recordFeedback(seedDir, localDir, userId, feedback) {
  const option = FEEDBACK_OPTIONS.find((item) => item.label === feedback.label || item.eventType === feedback.type);
  if (!option) {
    const error = new Error("未知反馈类型。");
    error.status = 400;
    throw error;
  }

  const user = await ensureLocalUser(seedDir, localDir, userId);
  const profile = normalizeProfile(user.profile, user.userContext);
  profile.events.push({
    type: option.eventType,
    label: option.label,
    createdAt: new Date().toISOString(),
    source: feedback.source || "demo",
    mealName: feedback.mealName || "",
  });
  profile.events = profile.events.slice(-40);
  profile.traits = deriveTraits(profile, user.userContext);
  profile.updatedAt = new Date().toISOString();

  user.profile = profile;
  await saveLocalUser(localDir, user);
  return getUserState(seedDir, localDir, userId);
}

async function getVisionCache(seedDir, localDir, userId) {
  await ensureLocalUser(seedDir, localDir, userId);
  try {
    const raw = await readFile(join(userDir(localDir, userId), "vision-cache.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveVisionCache(seedDir, localDir, userId, cache) {
  await ensureLocalUser(seedDir, localDir, userId);
  const payload = {
    provider: cache.provider || "model",
    model: cache.model || "model",
    vision: cache.vision,
    cachedAt: cache.cachedAt || new Date().toISOString(),
  };
  await writeJson(join(userDir(localDir, userId), "vision-cache.json"), payload);
  return payload;
}

async function ensureLocalUser(seedDir, localDir, userId) {
  const safeId = sanitizeUserId(userId);
  await mkdir(userDir(localDir, safeId), { recursive: true });

  const localPath = join(userDir(localDir, safeId), "profile.json");
  try {
    return JSON.parse(await readFile(localPath, "utf8"));
  } catch {
    const seed = await readSeedUser(seedDir, safeId);
    const profile = normalizeProfile(seed.profile, seed.userContext);
    const user = {
      ...seed,
      id: safeId,
      profile: {
        ...profile,
        traits: deriveTraits(profile, seed.userContext),
        updatedAt: new Date().toISOString(),
      },
    };
    await saveLocalUser(localDir, user);
    return user;
  }
}

async function saveLocalUser(localDir, user) {
  await mkdir(userDir(localDir, user.id), { recursive: true });
  await writeJson(join(userDir(localDir, user.id), "profile.json"), user);
}

async function readSeedUsers(seedDir) {
  const files = await readdir(seedDir);
  const users = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    users.push(JSON.parse(await readFile(join(seedDir, file), "utf8")));
  }
  return users.sort((a, b) => a.id.localeCompare(b.id));
}

async function readSeedUser(seedDir, userId) {
  const users = await readSeedUsers(seedDir);
  const user = users.find((item) => item.id === userId) || users[0];
  if (!user) {
    const error = new Error("没有可用演示用户。");
    error.status = 500;
    throw error;
  }
  return user;
}

function normalizeProfile(profile, userContext) {
  const explicit = profile?.explicitPreferences || {};
  return {
    explicitPreferences: {
      cookingLevel: explicit.cookingLevel || userContext.user.cookingLevel,
      taste: Array.isArray(explicit.taste) ? explicit.taste : userContext.user.preferences,
      avoid: Array.isArray(explicit.avoid) ? explicit.avoid : userContext.user.avoid,
      tools: Array.isArray(explicit.tools) ? explicit.tools : [],
      cleaningTolerance: explicit.cleaningTolerance || "中",
      timeBudget: explicit.timeBudget || userContext.context.availableCookingTime,
    },
    events: Array.isArray(profile?.events) ? profile.events.slice(-40) : [],
    traits: Array.isArray(profile?.traits) ? profile.traits : [],
    updatedAt: profile?.updatedAt || new Date().toISOString(),
  };
}

function buildUserContext(user) {
  const profile = normalizeProfile(user.profile, user.userContext);
  return {
    ...user.userContext,
    user: {
      ...user.userContext.user,
      cookingLevel: profile.explicitPreferences.cookingLevel,
      preferences: profile.explicitPreferences.taste,
      avoid: profile.explicitPreferences.avoid,
    },
    profile: {
      explicitPreferences: profile.explicitPreferences,
      recentEvents: profile.events.slice(-8),
      traits: profile.traits,
      updatedAt: profile.updatedAt,
    },
  };
}

function deriveTraits(profile, userContext) {
  const traits = [];
  const taste = profile.explicitPreferences.taste || [];
  const avoid = profile.explicitPreferences.avoid || [];
  const eventCount = (type) => profile.events.filter((event) => event.type === type).length;

  if (profile.explicitPreferences.cleaningTolerance.includes("低") || eventCount("low_cleanup") > 0 || taste.includes("不爱洗太多锅") || taste.includes("少洗锅")) {
    traits.push(createTrait("onePotPreference", "低洗锅倾向", 0.78, ["显式偏好或反馈中出现少洗锅诉求"]));
  }

  if (eventCount("too_complex") > 0 || profile.explicitPreferences.cookingLevel === "新手") {
    traits.push(createTrait("quickMealPreference", "快手饭倾向", 0.72, ["当前厨艺或反馈显示需要降低复杂度"]));
  }

  if (eventCount("too_many_missing") > 0) {
    traits.push(createTrait("existingInventoryPreference", "优先使用现有库存", 0.74, ["近期反馈中出现缺料太多"], 7));
  }

  if (eventCount("not_filling") > 0 || taste.includes("抗饿")) {
    traits.push(createTrait("satietyNeed", "需要更抗饿", 0.72, ["反馈或显式偏好中出现抗饿诉求"]));
  }

  if (eventCount("lighter_taste") > 0 || taste.includes("少油") || taste.includes("清淡") || avoid.includes("重油")) {
    traits.push(createTrait("lightTastePreference", "清淡少油倾向", 0.76, ["显式偏好或反馈中出现清淡少油诉求"]));
  }

  if (eventCount("delivery_today") > 0) {
    traits.push(createTrait("deliveryFallbackPreference", "外卖兜底倾向", 0.66, ["近期反馈中出现今天就想外卖"], 7));
  }

  if (eventCount("accept_meal") > 0) {
    traits.push(createTrait("acceptedRecentRecommendation", "近期接受推荐", 0.62, ["用户近期点击过想吃"], 7));
  }

  const hour = Number((userContext.context.time || "0").split(":")[0]);
  if (hour >= 21) {
    traits.push(createTrait("lateNightWarmMealPattern", "深夜热食场景", 0.68, ["当前场景时间较晚", userContext.user.goal || "想吃热食"], 7));
  }

  if (taste.includes("高蛋白")) {
    traits.push(createTrait("proteinPreference", "高蛋白倾向", 0.74, ["显式偏好高蛋白"]));
  }

  return traits;
}

function createTrait(key, label, confidence, evidence, days = 14) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    key,
    label,
    confidence,
    evidence,
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function sanitizeUserId(userId) {
  return String(userId || "xiaolin").replace(/[^a-zA-Z0-9_-]/g, "") || "xiaolin";
}

function userDir(localDir, userId) {
  return join(localDir, sanitizeUserId(userId));
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
