(function () {
  const SELECTED_USER_KEY = "fridgeDinner:selectedUserId:v1";
  const FALLBACK_PROFILE_KEY = "fridgeDinner:userProfileFallback:v1";
  const FALLBACK_VISION_KEY = "fridgeDinner:lastVisionResult:v1";

  const DEFAULT_USER_CONTEXT = {
    user: {
      name: "小林",
      cookingLevel: "新手",
      preferences: ["少油", "微辣", "不爱洗太多锅"],
      avoid: ["香菜", "复杂刀工", "油炸"],
      recentMeals: ["黄焖鸡外卖", "麻辣烫", "便利店饭团"],
      goal: "今晚想吃热的，但不要太麻烦",
    },
    context: {
      time: "21:10",
      availableCookingTime: "25 分钟",
      energyLevel: "低",
      nextSchedule: "22:00 继续改项目文档",
      weather: "小雨",
    },
  };

  const FEEDBACK_OPTIONS = [
    { label: "想吃", eventType: "accept_meal" },
    { label: "太麻烦", eventType: "too_complex" },
    { label: "不够抗饿", eventType: "not_filling" },
    { label: "不想洗锅", eventType: "low_cleanup" },
    { label: "换清淡点", eventType: "lighter_taste" },
    { label: "今天就想外卖", eventType: "delivery_today" },
  ];

  const state = {
    users: [],
    selectedUserId: localStorage.getItem(SELECTED_USER_KEY) || "xiaolin",
    userState: null,
    visionCache: null,
    ready: false,
  };

  function createDefaultProfile() {
    return {
      explicitPreferences: {
        cookingLevel: DEFAULT_USER_CONTEXT.user.cookingLevel,
        taste: DEFAULT_USER_CONTEXT.user.preferences,
        avoid: DEFAULT_USER_CONTEXT.user.avoid,
        cleaningTolerance: "低",
        timeBudget: DEFAULT_USER_CONTEXT.context.availableCookingTime,
      },
      events: [],
      traits: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function defaultUserState() {
    const profile = readFallbackProfile();
    return {
      id: state.selectedUserId || "xiaolin",
      name: DEFAULT_USER_CONTEXT.user.name,
      label: "本地兜底用户",
      description: "服务端用户文件不可用时使用的浏览器兜底画像。",
      userContext: {
        ...DEFAULT_USER_CONTEXT,
        profile: {
          explicitPreferences: profile.explicitPreferences,
          recentEvents: profile.events.slice(-8),
          traits: profile.traits,
          updatedAt: profile.updatedAt,
        },
      },
      profile,
    };
  }

  async function init() {
    try {
      const usersPayload = await getJson("/api/users");
      state.users = usersPayload.users || [];
      const selected = state.users.some((user) => user.id === state.selectedUserId)
        ? state.selectedUserId
        : state.users[0]?.id || "xiaolin";
      await selectUser(selected);
      state.ready = true;
    } catch {
      state.users = [
        {
          id: state.selectedUserId,
          name: DEFAULT_USER_CONTEXT.user.name,
          label: "浏览器兜底",
          description: "本地服务不可用时的兜底画像。",
        },
      ];
      state.userState = defaultUserState();
      state.visionCache = readFallbackVision();
      state.ready = false;
    }
    return state;
  }

  async function selectUser(userId) {
    state.selectedUserId = userId || "xiaolin";
    localStorage.setItem(SELECTED_USER_KEY, state.selectedUserId);

    try {
      state.userState = await getJson(`/api/users/${encodeURIComponent(state.selectedUserId)}`);
      const cachePayload = await getJson(`/api/users/${encodeURIComponent(state.selectedUserId)}/vision-cache`);
      state.visionCache = cachePayload.cache || null;
    } catch {
      state.userState = defaultUserState();
      state.visionCache = readFallbackVision();
    }
    return state;
  }

  function readProfile() {
    return state.userState?.profile || readFallbackProfile();
  }

  function readFallbackProfile() {
    try {
      const parsed = JSON.parse(localStorage.getItem(fallbackKey(FALLBACK_PROFILE_KEY)) || localStorage.getItem(FALLBACK_PROFILE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return createDefaultProfile();
      return normalizeProfile(parsed);
    } catch {
      return createDefaultProfile();
    }
  }

  function normalizeProfile(profile) {
    const fallback = createDefaultProfile();
    return {
      ...fallback,
      ...profile,
      explicitPreferences: {
        ...fallback.explicitPreferences,
        ...profile.explicitPreferences,
      },
      events: Array.isArray(profile.events) ? profile.events.slice(-30) : [],
      traits: Array.isArray(profile.traits) ? profile.traits : [],
    };
  }

  function saveFallbackProfile(profile) {
    const normalized = normalizeProfile(profile);
    normalized.traits = deriveTraits(normalized);
    normalized.updatedAt = new Date().toISOString();
    localStorage.setItem(fallbackKey(FALLBACK_PROFILE_KEY), JSON.stringify(normalized));
    return normalized;
  }

  async function recordFeedback(optionLabel, details = {}) {
    const option = FEEDBACK_OPTIONS.find((item) => item.label === optionLabel);
    if (!option) return state.userState || defaultUserState();

    try {
      state.userState = await postJson(`/api/users/${encodeURIComponent(state.selectedUserId)}/feedback`, {
        label: option.label,
        type: option.eventType,
        ...details,
      });
      return state.userState;
    } catch {
      const profile = readProfile();
      profile.events.push({
        type: option.eventType,
        label: option.label,
        createdAt: new Date().toISOString(),
        ...details,
      });
      const saved = saveFallbackProfile(profile);
      state.userState = {
        ...defaultUserState(),
        profile: saved,
      };
      return state.userState;
    }
  }

  async function saveVisionCache(cache) {
    const payload = {
      provider: cache.provider || "model",
      model: cache.model || "model",
      vision: cache.vision,
      cachedAt: cache.cachedAt || new Date().toISOString(),
    };
    state.visionCache = payload;
    try {
      const saved = await postJson(`/api/users/${encodeURIComponent(state.selectedUserId)}/vision-cache`, payload);
      state.visionCache = saved.cache || payload;
      localStorage.removeItem(fallbackKey(FALLBACK_VISION_KEY));
    } catch {
      localStorage.setItem(fallbackKey(FALLBACK_VISION_KEY), JSON.stringify(payload));
    }
    return state.visionCache;
  }

  function readVisionCache() {
    return state.visionCache || readFallbackVision();
  }

  function readFallbackVision() {
    try {
      const cached = JSON.parse(localStorage.getItem(fallbackKey(FALLBACK_VISION_KEY)) || localStorage.getItem(FALLBACK_VISION_KEY) || "null");
      if (!cached?.vision?.items?.length) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function clearProfile() {
    localStorage.removeItem(fallbackKey(FALLBACK_PROFILE_KEY));
    return createDefaultProfile();
  }

  function fallbackKey(baseKey, userId = state.selectedUserId) {
    return `${baseKey}:${encodeURIComponent(userId || "xiaolin")}`;
  }

  function countEvents(profile, type) {
    return profile.events.filter((event) => event.type === type).length;
  }

  function trait(key, label, confidence, evidence, days = 14) {
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

  function deriveTraits(profile) {
    const traits = [];
    const preferences = profile.explicitPreferences || {};
    const taste = preferences.taste || [];

    if (preferences.cleaningTolerance === "低" || countEvents(profile, "low_cleanup") > 0 || taste.includes("不爱洗太多锅")) {
      traits.push(
        trait("onePotPreference", "低洗锅倾向", 0.78, ["显式偏好不爱洗太多锅", "反馈中出现少洗锅诉求"].filter(Boolean)),
      );
    }

    if (countEvents(profile, "too_complex") > 0 || preferences.cookingLevel === "新手") {
      traits.push(trait("quickMealPreference", "快手饭倾向", 0.72, ["当前厨艺为新手", "反馈中出现太麻烦"]));
    }

    if (countEvents(profile, "not_filling") > 0) {
      traits.push(trait("satietyNeed", "需要更抗饿", 0.7, ["反馈中出现不够抗饿"]));
    }

    if (countEvents(profile, "lighter_taste") > 0 || taste.includes("少油")) {
      traits.push(trait("lightTastePreference", "清淡少油倾向", 0.74, ["显式偏好少油", "反馈中出现换清淡点"].filter(Boolean)));
    }

    if (countEvents(profile, "delivery_today") > 0) {
      traits.push(trait("deliveryFallbackPreference", "外卖兜底倾向", 0.66, ["反馈中出现今天就想外卖"], 7));
    }

    if (countEvents(profile, "accept_meal") > 0) {
      traits.push(trait("acceptedRecentRecommendation", "近期接受推荐", 0.62, ["用户点击过想吃"], 7));
    }

    const hour = Number((DEFAULT_USER_CONTEXT.context.time || "0").split(":")[0]);
    if (hour >= 21) {
      traits.push(trait("lateNightWarmMealPattern", "深夜热食场景", 0.68, ["当前场景时间较晚", "目标是今晚想吃热的"], 7));
    }

    return traits;
  }

  function buildUserContext() {
    return state.userState?.userContext || defaultUserState().userContext;
  }

  function getTraitLabels() {
    return readProfile().traits.map((item) => item.label);
  }

  function getUsers() {
    return state.users;
  }

  function getSelectedUserId() {
    return state.selectedUserId;
  }

  async function getJson(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
    return data;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
    return data;
  }

  window.FridgeProfile = {
    DEFAULT_USER_CONTEXT,
    FEEDBACK_OPTIONS,
    init,
    selectUser,
    getUsers,
    getSelectedUserId,
    readProfile,
    recordFeedback,
    saveVisionCache,
    readVisionCache,
    clearProfile,
    buildUserContext,
    getTraitLabels,
  };
})();
