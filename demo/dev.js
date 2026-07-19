let userContext = window.FridgeProfile.buildUserContext();

const elements = {
  healthBadge: document.querySelector("#healthBadge"),
  fridgeUpload: document.querySelector("#fridgeUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  analyzeButton: document.querySelector("#analyzeButton"),
  planButton: document.querySelector("#planButton"),
  organizationButton: document.querySelector("#organizationButton"),
  cacheVisionButton: document.querySelector("#cacheVisionButton"),
  targetDishUpload: document.querySelector("#targetDishUpload"),
  targetDishPreview: document.querySelector("#targetDishPreview"),
  targetDishGuess: document.querySelector("#targetDishGuess"),
  targetDishText: document.querySelector("#targetDishText"),
  targetVoiceButton: document.querySelector("#targetVoiceButton"),
  targetVoiceStatus: document.querySelector("#targetVoiceStatus"),
  targetIngredientFocus: document.querySelector("#targetIngredientFocus"),
  targetDishTime: document.querySelector("#targetDishTime"),
  targetDishAnalyzeButton: document.querySelector("#targetDishAnalyzeButton"),
  targetDishButton: document.querySelector("#targetDishButton"),
  statusText: document.querySelector("#statusText"),
  userSelect: document.querySelector("#userSelect"),
  profileTraits: document.querySelector("#profileTraits"),
  feedbackActions: document.querySelector("#feedbackActions"),
  reviewRefreshButton: document.querySelector("#reviewRefreshButton"),
  reviewSummary: document.querySelector("#reviewSummary"),
  reviewUserList: document.querySelector("#reviewUserList"),
  reviewProfileDetails: document.querySelector("#reviewProfileDetails"),
  reviewProfileRaw: document.querySelector("#reviewProfileRaw"),
  retrievalMode: document.querySelector("#retrievalMode"),
  retrievalRoute: document.querySelector("#retrievalRoute"),
  retrievalPreviewButton: document.querySelector("#retrievalPreviewButton"),
  visionMeta: document.querySelector("#visionMeta"),
  inventoryList: document.querySelector("#inventoryList"),
  uncertainBox: document.querySelector("#uncertainBox"),
  visionRaw: document.querySelector("#visionRaw"),
  organizationRaw: document.querySelector("#organizationRaw"),
  planRaw: document.querySelector("#planRaw"),
  targetRaw: document.querySelector("#targetRaw"),
  lifeLogUpload: document.querySelector("#lifeLogUpload"),
  lifeLogMealName: document.querySelector("#lifeLogMealName"),
  lifeLogPreview: document.querySelector("#lifeLogPreview"),
  lifeLogSampleButton: document.querySelector("#lifeLogSampleButton"),
  lifeLogGenerateButton: document.querySelector("#lifeLogGenerateButton"),
  lifeLogRaw: document.querySelector("#lifeLogRaw"),
  toast: document.querySelector("#toast"),
};

let uploadedImageDataUrl = "";
let uploadedSourceFileName = "";
let targetDishImageDataUrl = "";
let targetDishSourceFileName = "";
let targetDishImageAnalysis = null;
let lifeLogImageDataUrl = "";
let lifeLogSourceFileName = "";
let targetVoiceController = null;
let currentVision = { items: [], uncertainItems: [], warnings: [] };
let confirmedItems = new Set();
let isBusy = false;
let operationTimer = 0;

const MAX_IMAGE_EDGE = 1600;
const COMPRESS_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_JPEG_QUALITY = 0.82;

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setBusy(busy) {
  isBusy = busy;
  elements.analyzeButton.disabled = busy || !uploadedImageDataUrl;
  elements.planButton.disabled = busy || !confirmedItems.size;
  elements.organizationButton.disabled = busy || !confirmedItems.size;
  elements.targetDishAnalyzeButton.disabled = busy || !targetDishImageDataUrl;
  elements.targetDishButton.disabled = busy || !confirmedItems.size || !elements.targetDishText.value.trim();
  elements.retrievalPreviewButton.disabled = busy || !confirmedItems.size;
  elements.lifeLogSampleButton.disabled = busy;
  elements.lifeLogGenerateButton.disabled = busy || !lifeLogImageDataUrl;
  targetVoiceController?.setDisabled(busy);
  elements.statusText.classList.toggle("busy", busy);
  updateCacheButton(busy);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function renderJson(target, data) {
  target.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reviewEventSource(source) {
  return {
    seed: "演示种子",
    demo: "演示种子",
    dev: "本机检验台操作",
    "showcase-result": "展示端会话反馈",
  }[source] || "本机会话事件";
}

function renderReviewList(items, emptyText) {
  return items.length ? `<ul>${items.join("")}</ul>` : `<p>${escapeHtml(emptyText)}</p>`;
}

async function renderReviewData() {
  if (!elements.reviewSummary) return;
  elements.reviewRefreshButton.disabled = true;
  elements.reviewSummary.textContent = "正在读取本机演示画像。";
  try {
    const usersPayload = await getJson("/api/users");
    const profiles = await Promise.all((usersPayload.users || []).map((user) => (
      getJson(`/api/users/${encodeURIComponent(user.id)}`)
    )));
    const selectedId = window.FridgeProfile.getSelectedUserId();
    const selected = profiles.find((user) => user.id === selectedId) || profiles[0];
    const totalEvents = profiles.reduce((sum, user) => sum + (user.profile?.events?.length || 0), 0);
    const totalTraits = profiles.reduce((sum, user) => sum + (user.profile?.traits?.length || 0), 0);

    elements.reviewSummary.innerHTML = [
      `<span><strong>${profiles.length}</strong>个演示画像</span>`,
      `<span><strong>${totalEvents}</strong>条演示/本机事件</span>`,
      `<span><strong>${totalTraits}</strong>个规则推断标签</span>`,
    ].join("");

    elements.reviewUserList.innerHTML = profiles.map((user) => {
      const eventCount = user.profile?.events?.length || 0;
      const traitCount = user.profile?.traits?.length || 0;
      return `<button type="button" data-review-user="${escapeHtml(user.id)}" class="${user.id === selected?.id ? "active" : ""}">
        <strong>${escapeHtml(user.name)} · ${escapeHtml(user.label)}</strong>
        <span>${escapeHtml(user.description)}</span>
        <small>${eventCount} 条事件 · ${traitCount} 个推断标签</small>
      </button>`;
    }).join("");

    if (!selected) {
      elements.reviewProfileDetails.innerHTML = "<p>暂无演示画像。</p>";
      renderJson(elements.reviewProfileRaw, { users: [] });
      return;
    }

    const profile = selected.profile || {};
    const preferences = profile.explicitPreferences || {};
    const preferenceItems = [
      ["厨艺", preferences.cookingLevel],
      ["口味", (preferences.taste || []).join("、")],
      ["避免", (preferences.avoid || []).join("、")],
      ["工具", (preferences.tools || []).join("、")],
      ["洗锅容忍", preferences.cleaningTolerance],
      ["时间预算", preferences.timeBudget],
    ].filter(([, value]) => value);
    const events = (profile.events || []).slice(-8).reverse();
    const traits = profile.traits || [];

    elements.reviewProfileDetails.innerHTML = `
      <div class="review-source-group">
        <div><h4>显式偏好</h4><span class="review-source-tag seed">演示种子</span></div>
        ${renderReviewList(preferenceItems.map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`), "暂无显式偏好。")}
      </div>
      <div class="review-source-group">
        <div><h4>行为事件</h4><span class="review-source-tag event">种子 / 本机会话</span></div>
        ${renderReviewList(events.map((event) => `<li><strong>${escapeHtml(event.label || event.type)}</strong><span>${escapeHtml(reviewEventSource(event.source))}${event.mealName ? ` · ${escapeHtml(event.mealName)}` : ""}</span></li>`), "暂无行为事件。")}
      </div>
      <div class="review-source-group">
        <div><h4>推断画像</h4><span class="review-source-tag rule">确定性规则</span></div>
        ${renderReviewList(traits.map((trait) => `<li><strong>${escapeHtml(trait.label)} · ${Math.round(Number(trait.confidence || 0) * 100)}%</strong><span>${escapeHtml((trait.evidence || []).join(" / "))}</span></li>`), "暂无推断标签。")}
      </div>`;

    renderJson(elements.reviewProfileRaw, {
      boundary: "演示画像 + 本机会话，不是抖音真实用户数据",
      sources: {
        explicitPreferences: "demo_seed",
        events: "demo_seed_or_local_session",
        traits: "deterministic_rules",
      },
      selected,
    });

    document.querySelectorAll("[data-review-user]").forEach((button) => {
      button.addEventListener("click", async () => {
        await window.FridgeProfile.selectUser(button.dataset.reviewUser);
        refreshUserContext();
        renderProfile();
        await renderReviewData();
      });
    });
  } catch (error) {
    elements.reviewSummary.textContent = `读取失败：${error.message}`;
    elements.reviewUserList.innerHTML = "";
    elements.reviewProfileDetails.innerHTML = "<p>确认使用本地开发服务，生产环境会主动关闭该接口。</p>";
    renderJson(elements.reviewProfileRaw, { error: error.message });
  } finally {
    elements.reviewRefreshButton.disabled = false;
  }
}

function refreshUserContext() {
  userContext = window.FridgeProfile.buildUserContext();
}

function renderProfile() {
  refreshUserContext();
  const users = window.FridgeProfile.getUsers();
  elements.userSelect.innerHTML = users
    .map((user) => `<option value="${user.id}" ${user.id === window.FridgeProfile.getSelectedUserId() ? "selected" : ""}>${user.name} · ${user.label}</option>`)
    .join("");

  const traits = userContext.profile?.traits || [];
  elements.profileTraits.innerHTML = traits.length
    ? traits.map((trait) => `<span title="${trait.evidence.join(" / ")}">${trait.label} · ${(trait.confidence * 100).toFixed(0)}%</span>`).join("")
    : "<span>暂无推断标签</span>";

  elements.feedbackActions.innerHTML = window.FridgeProfile.FEEDBACK_OPTIONS.map(
    (option) => `<button type="button" data-feedback-label="${option.label}">${option.label}</button>`,
  ).join("");

  document.querySelectorAll("[data-feedback-label]").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.FridgeProfile.recordFeedback(button.dataset.feedbackLabel, { source: "dev" });
      renderProfile();
      await renderReviewData();
      renderJson(elements.planRaw, { userContext: window.FridgeProfile.buildUserContext(), note: "画像反馈已更新，下一次晚餐规划会带上 traits。" });
      showToast(`已记录反馈：${button.dataset.feedbackLabel}`);
    });
  });
}

function operationHint(kind, seconds) {
  if (kind === "vision") {
    if (seconds < 3) return "发送图片到本地服务";
    if (seconds < 18) return "等待视觉模型返回";
    if (seconds < 45) return "模型仍在识别，可以继续等待";
    return "耗时较长，必要时加载上次识别继续演示";
  }

  if (kind === "target") {
    if (seconds < 3) return "发送目标菜、库存和画像";
    if (seconds < 16) return "判断复刻路线";
    if (seconds < 35) return "生成缺料、替代和模拟商城卡";
    return "耗时较长，请稍等";
  }

  if (kind === "dishVision") {
    if (seconds < 3) return "发送目标菜图片";
    if (seconds < 18) return "识别菜名和关键材料";
    if (seconds < 45) return "模型仍在看菜图";
    return "耗时较长，请稍等";
  }

  if (seconds < 3) return "发送人工确认库存";
  if (seconds < 16) return "等待晚餐规划模型";
  if (seconds < 35) return "模型仍在生成方案";
  return "耗时较长，请稍等";
}

function startOperationStatus(kind, label) {
  const startedAt = Date.now();
  window.clearInterval(operationTimer);
  const tick = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    setStatus(`${label} · 已用时 ${seconds}s · ${operationHint(kind, seconds)}`);
  };
  tick();
  operationTimer = window.setInterval(tick, 1000);
  elements.statusText.classList.add("busy");
  return startedAt;
}

function finishOperationStatus(message) {
  window.clearInterval(operationTimer);
  operationTimer = 0;
  elements.statusText.classList.remove("busy");
  setStatus(message);
}

function readCachedVision() {
  return window.FridgeProfile.readVisionCache();
}

function saveCachedVision(data) {
  if (!data?.vision?.items?.length) return;
  const payload = {
    provider: data.provider || "model",
    model: data.model || "model",
    vision: normalizeVision(data.vision),
    cachedAt: new Date().toISOString(),
  };
  window.FridgeProfile.saveVisionCache(payload);
  updateCacheButton(isBusy);
}

function formatCacheTime(value) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateCacheButton(forceBusy = isBusy) {
  const cached = readCachedVision();
  elements.cacheVisionButton.disabled = forceBusy || !cached;
  elements.cacheVisionButton.textContent = cached ? "加载上次识别" : "暂无识别缓存";
}

function normalizeVision(vision) {
  return {
    items: Array.isArray(vision?.items) ? vision.items : [],
    uncertainItems: Array.isArray(vision?.uncertainItems) ? vision.uncertainItems : [],
    warnings: Array.isArray(vision?.warnings) ? vision.warnings : [],
  };
}

function normalizeTargetDishVision(vision) {
  return {
    dishName: vision?.dishName || "目标菜待确认",
    confidence: typeof vision?.confidence === "number" ? vision.confidence : 0,
    dishType: vision?.dishType || "菜品",
    coreTaste: vision?.coreTaste || "口味待确认",
    likelyIngredients: Array.isArray(vision?.likelyIngredients) ? vision.likelyIngredients : [],
    optionalIngredients: Array.isArray(vision?.optionalIngredients) ? vision.optionalIngredients : [],
    requiredTools: Array.isArray(vision?.requiredTools) ? vision.requiredTools : [],
    estimatedTime: vision?.estimatedTime || "耗时待确认",
    difficulty: vision?.difficulty || "难度待确认",
    visualEvidence: Array.isArray(vision?.visualEvidence) ? vision.visualEvidence : [],
    warnings: Array.isArray(vision?.warnings) ? vision.warnings : [],
  };
}

function cleanDishName(name) {
  const cleaned = String(name || "")
    .replace(/^(疑似|可能是|可能为|大概率是)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleaned) return "";
  if (/^(模型结果|目标菜|目标菜待确认|待确认|未知|未知菜品|无法确定|不确定|菜品|食物|图片|照片)$/i.test(cleaned)) return "";
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 18);
}

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/[，。！？,.!?]+$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isSupplementSpeech(text) {
  return /(只有|不要|不想|少油|少盐|清淡|微辣|别太辣|不辣|分钟|小时|洗锅|锅具|空气炸锅|明天|这周|今晚|今天|太麻烦|简单点)/.test(text);
}

function applySpeechToTargetDish(rawText) {
  const text = normalizeSpeechText(rawText);
  if (!text) return;

  const current = elements.targetDishText.value.trim();
  const timeText = elements.targetDishTime.options[elements.targetDishTime.selectedIndex]?.textContent || "今晚";
  const alreadyHasIntent = /(想吃|想做|复刻|做一道|来一份)/.test(text);
  const shouldAppend = current && isSupplementSpeech(text) && !alreadyHasIntent;
  const nextText = shouldAppend ? `${current.replace(/[；;，,。]+$/g, "")}；${text}` : alreadyHasIntent ? text : `我${timeText}想吃${text}`;

  elements.targetDishText.value = nextText;
  elements.targetDishButton.disabled = isBusy || !confirmedItems.size || !nextText.trim();
  renderJson(elements.targetRaw, { speechText: text, targetDishText: nextText, note: "语音已写入，可手动修改后再调用目标菜规划。" });
  showToast("语音已写入目标菜");
}

function setTargetIngredientOptions(values, placeholder) {
  const options = Array.isArray(values) ? values.filter(Boolean).slice(0, 8) : [];
  elements.targetIngredientFocus.replaceChildren();
  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    elements.targetIngredientFocus.append(option);
    elements.targetIngredientFocus.disabled = true;
    return;
  }
  options.forEach((ingredient) => {
    const option = document.createElement("option");
    option.value = ingredient;
    option.textContent = ingredient;
    elements.targetIngredientFocus.append(option);
  });
  elements.targetIngredientFocus.disabled = false;
}

function renderTargetDishGuess() {
  if (!targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "可直接输入目标菜，也可以上传菜图后点击「识别目标菜」。";
    setTargetIngredientOptions([], "识别目标菜后选择");
    return;
  }

  if (targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "已上传目标菜图，等待识别。识别后仍可手动修改目标菜名。";
    setTargetIngredientOptions([], "等待识别");
    return;
  }

  const vision = normalizeTargetDishVision(targetDishImageAnalysis);
  const ingredients = vision.likelyIngredients.slice(0, 5).join("、") || "关键材料待确认";
  const tools = vision.requiredTools.slice(0, 3).join("、") || "常规厨具";
  elements.targetDishGuess.innerHTML = `
    <strong>${vision.dishName}</strong> · 置信 ${(vision.confidence * 100).toFixed(0)}% · ${vision.difficulty}<br />
    关键材料：${ingredients}<br />
    可能工具：${tools}；预计 ${vision.estimatedTime}
  `;
  const focusOptions = vision.likelyIngredients.slice(0, 8);
  setTargetIngredientOptions(focusOptions, "没有可选关键食材");
}

function getConfirmedInventory() {
  return currentVision.items.filter((item) => confirmedItems.has(item.name));
}

function applyVisionResult(data, sourceLabel) {
  currentVision = normalizeVision(data.vision);
  confirmedItems = new Set(currentVision.items.map((item) => item.name));
  renderInventory();
  renderJson(elements.visionRaw, data);
  elements.visionMeta.textContent = `${sourceLabel} · ${confirmedItems.size}/${currentVision.items.length} 已确认`;
}

function renderInventory() {
  if (!currentVision.items.length) {
    elements.inventoryList.innerHTML = `
      <div class="inventory-empty">识别完成后，食材会出现在这里。勾选结果会作为晚餐规划输入。</div>
    `;
    elements.planButton.disabled = true;
    elements.organizationButton.disabled = true;
  } else {
    elements.inventoryList.innerHTML = currentVision.items
      .map((item) => {
        const checked = confirmedItems.has(item.name);
        const confidence = typeof item.confidence === "number" ? `${(item.confidence * 100).toFixed(0)}%` : "未知";
        return `
          <label class="inventory-item ${checked ? "checked" : ""}">
            <input type="checkbox" data-item-name="${item.name}" ${checked ? "checked" : ""} />
            <span class="item-main">
              <strong>${item.name}</strong>
              <small>${item.category || "其他"} · ${item.quantityEstimate || "数量待确认"} · 置信 ${confidence}</small>
            </span>
            <span class="item-state">${item.state || "需确认"}</span>
          </label>
        `;
      })
      .join("");

    document.querySelectorAll("[data-item-name]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          confirmedItems.add(input.dataset.itemName);
        } else {
          confirmedItems.delete(input.dataset.itemName);
        }
        renderInventory();
      });
    });
  }

  const uncertain = currentVision.uncertainItems.map((item) => `<li>${item.description}：${item.reason}</li>`).join("");
  const warnings = currentVision.warnings.map((warning) => `<li>${warning}</li>`).join("");
  elements.uncertainBox.innerHTML = `
    <strong>不确定项与安全边界</strong>
    <ul>${uncertain || warnings ? `${uncertain}${warnings}` : "<li>暂无。</li>"}</ul>
  `;

  elements.visionMeta.textContent = `${confirmedItems.size}/${currentVision.items.length} 已确认`;
  elements.planButton.disabled = !confirmedItems.size;
  elements.organizationButton.disabled = !confirmedItems.size;
  elements.targetDishAnalyzeButton.disabled = !targetDishImageDataUrl;
  elements.targetDishButton.disabled = !confirmedItems.size || !elements.targetDishText.value.trim();
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请上传图片文件"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener("load", async () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const maxEdge = Math.max(width, height);

        if (maxEdge <= MAX_IMAGE_EDGE && file.size <= COMPRESS_IMAGE_BYTES) {
          URL.revokeObjectURL(objectUrl);
          resolve(await readFileDataUrl(file));
          return;
        }

        const scale = Math.min(1, MAX_IMAGE_EDGE / maxEdge);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败"));
    });

    image.src = objectUrl;
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error || `请求失败：${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    const routes = health.modelRouting
      ? `视觉:${health.modelRouting.vision} · 规划:${health.modelRouting.planning} · 生活记录:${health.modelRouting.lifeLog}`
      : health.model;
    elements.healthBadge.textContent = `${health.provider} · ${routes} · key:${health.hasApiKey ? "yes" : "no"}`;
  } catch {
    elements.healthBadge.textContent = "服务未连接";
  }
}

async function runVision() {
  if (!uploadedImageDataUrl) return;

  try {
    setBusy(true);
    const startedAt = startOperationStatus("vision", "正在调用 /api/analyze-fridge");
    renderJson(elements.visionRaw, "请求中...");
    const data = await postJson("/api/analyze-fridge", { imageDataUrl: uploadedImageDataUrl, sourceFileName: uploadedSourceFileName });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    applyVisionResult(data, `${data.provider || "provider"} · ${data.model || "model"}`);
    saveCachedVision(data);
    finishOperationStatus(`视觉识别完成，用时 ${seconds}s。已自动缓存本次识别结果。`);
    showToast(`视觉识别完成，用时 ${seconds}s`);
  } catch (error) {
    currentVision = { items: [], uncertainItems: [], warnings: [] };
    confirmedItems = new Set();
    renderInventory();
    renderJson(elements.visionRaw, error.payload || { error: error.message });
    finishOperationStatus(`视觉识别失败：${error.message}`);
    showToast("视觉识别失败");
  } finally {
    setBusy(false);
  }
}

async function runPlan() {
  const inventory = getConfirmedInventory();
  if (!inventory.length) {
    showToast("请至少确认一个食材");
    return;
  }

  refreshUserContext();
  const requestPayload = { inventory, userContext, retrievalMode: elements.retrievalMode.value };
  try {
    setBusy(true);
    const startedAt = startOperationStatus("plan", "正在调用 /api/plan-dinner");
    renderJson(elements.planRaw, { request: requestPayload, response: "请求中..." });
    const data = await postJson("/api/plan-dinner", requestPayload);
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    renderJson(elements.planRaw, { request: requestPayload, response: data });
    finishOperationStatus(`晚餐规划完成，用时 ${seconds}s。可检查 request.inventory 是否就是你人工确认后的库存。`);
    showToast(`晚餐规划完成，用时 ${seconds}s`);
  } catch (error) {
    renderJson(elements.planRaw, { request: requestPayload, error: error.payload || error.message });
    finishOperationStatus(`晚餐规划失败：${error.message}`);
    showToast("晚餐规划失败");
  } finally {
    setBusy(false);
  }
}

async function runOrganizationPreview() {
  const inventory = getConfirmedInventory();
  if (!inventory.length) {
    showToast("请至少确认一个食材");
    return;
  }

  const requestPayload = { inventory, itemStates: [], storageConfirmations: [] };
  try {
    setBusy(true);
    const data = await postJson("/api/fridge-organization", requestPayload);
    renderJson(elements.organizationRaw, {
      request: requestPayload,
      response: data,
      note: "该接口不调用大模型；zones 保留 notes 到粗分区的证据，未确认包装时只返回 confirm_first。",
    });
    finishOperationStatus(`粗分区完成：${data.organization?.zones?.length || 0} 项，${data.organization?.suggestions?.length || 0} 条建议，耗时 ${data.trace?.organizationMs || 0}ms。`);
    showToast("已生成粗分区证据");
  } catch (error) {
    renderJson(elements.organizationRaw, { request: requestPayload, error: error.payload || error.message });
    finishOperationStatus(`粗分区失败：${error.message}`);
    showToast("粗分区检查失败");
  } finally {
    setBusy(false);
  }
}

async function loadLifeLogFile(file) {
  if (!file) return;
  elements.lifeLogPreview.src = URL.createObjectURL(file);
  elements.lifeLogPreview.style.display = "block";
  lifeLogImageDataUrl = await fileToDataUrl(file);
  lifeLogSourceFileName = file.name || "finished-dish.jpg";
  elements.lifeLogGenerateButton.disabled = isBusy || !lifeLogImageDataUrl;
  renderJson(elements.lifeLogRaw, {
    sourceFileName: lifeLogSourceFileName,
    note: "图片已加载，调用后将展示模型或演示缓存的结构化草稿、来源和耗时。",
  });
}

async function loadLifeLogSample() {
  try {
    setBusy(true);
    const response = await fetch("/demo-assets/菜/黄焖鸡-示例.png");
    if (!response.ok) throw new Error("示例成品图加载失败");
    const blob = await response.blob();
    await loadLifeLogFile(new File([blob], "黄焖鸡-示例.png", { type: blob.type || "image/png" }));
    finishOperationStatus("示例成品图已加载，可调用生活记录 Agent。");
    showToast("示例成品图已加载");
  } catch (error) {
    renderJson(elements.lifeLogRaw, { error: error.message });
    finishOperationStatus(`示例成品图加载失败：${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function runLifeLogDraft() {
  if (!lifeLogImageDataUrl) {
    showToast("请先上传成品图");
    return;
  }
  const requestPayload = {
    imageDataUrl: lifeLogImageDataUrl,
    sourceFileName: lifeLogSourceFileName,
    mealContext: {
      mealName: elements.lifeLogMealName.value.trim() || "这顿饭",
      summary: "仅供生成饭后生活记录草稿，不代表图片可证明的事实。",
    },
  };
  try {
    setBusy(true);
    const startedAt = startOperationStatus("lifeLog", "正在调用 /api/generate-life-log");
    renderJson(elements.lifeLogRaw, { request: { ...requestPayload, imageDataUrl: "[data URL omitted]" }, response: "请求中..." });
    const data = await postJson("/api/generate-life-log", requestPayload);
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    renderJson(elements.lifeLogRaw, {
      request: { ...requestPayload, imageDataUrl: "[data URL omitted]" },
      response: data,
      note: "source=model 表示真实模型；model-timeout-cache / model-error-cache 表示演示缓存兜底。草稿仍需人工确认。",
    });
    finishOperationStatus(`生活记录草稿完成，用时 ${seconds}s，来源 ${data.source || "unknown"}。`);
    showToast("生活记录草稿已生成");
  } catch (error) {
    renderJson(elements.lifeLogRaw, {
      request: { ...requestPayload, imageDataUrl: "[data URL omitted]" },
      error: error.payload || error.message,
    });
    finishOperationStatus(`生活记录草稿失败：${error.message}`);
    showToast("生活记录草稿失败");
  } finally {
    setBusy(false);
  }
}

async function runTargetDishVision() {
  if (!targetDishImageDataUrl) {
    showToast("请先上传目标菜图");
    return;
  }

  try {
    setBusy(true);
    const startedAt = startOperationStatus("dishVision", "正在调用 /api/analyze-target-dish");
    renderJson(elements.targetRaw, { targetDishVisionRequest: "请求中..." });
    const data = await postJson("/api/analyze-target-dish", { imageDataUrl: targetDishImageDataUrl, sourceFileName: targetDishSourceFileName });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    targetDishImageAnalysis = normalizeTargetDishVision(data.targetVision);
    const dishName = cleanDishName(targetDishImageAnalysis.dishName);
    if (dishName) {
      const timeText = elements.targetDishTime.options[elements.targetDishTime.selectedIndex]?.textContent || "今晚";
      elements.targetDishText.value = `我${timeText}想吃${dishName}`;
    }
    renderTargetDishGuess();
    renderJson(elements.targetRaw, { targetDishVisionResponse: data, note: "目标菜名已写入输入框，可手动修改后再调用复刻规划。" });
    finishOperationStatus(`目标菜识别完成，用时 ${seconds}s。可检查 targetVision 并手动修正菜名。`);
    showToast(`目标菜识别完成，用时 ${seconds}s`);
  } catch (error) {
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    renderJson(elements.targetRaw, { targetDishVisionError: error.payload || error.message });
    finishOperationStatus(`目标菜识别失败：${error.message}`);
    showToast("目标菜识别失败，可手动输入菜名");
  } finally {
    setBusy(false);
  }
}

async function runTargetPlan() {
  const inventory = getConfirmedInventory();
  const targetText = elements.targetDishText.value.trim();
  if (!inventory.length) {
    showToast("请至少确认一个食材");
    return;
  }
  if (!targetText) {
    showToast("请先输入想吃的菜");
    return;
  }

  refreshUserContext();
  const requestPayload = {
    inventory,
    targetDish: {
      text: targetText,
      intentTime: elements.targetDishTime.value || "tonight",
      imageAnalysis: targetDishImageAnalysis,
    },
    userContext,
    retrievalMode: elements.retrievalMode.value,
  };
  const focusedIngredient = elements.targetIngredientFocus.value;
  const substitutionPayload = focusedIngredient
    ? { targetIngredient: focusedIngredient, inventory, targetDish: targetText }
    : null;

  try {
    setBusy(true);
    const startedAt = startOperationStatus("target", "正在调用 /api/plan-target-dish");
    renderJson(elements.targetRaw, { request: requestPayload, response: "请求中..." });
    const substitutionPromise = substitutionPayload
      ? postJson("/api/ingredient-substitution", substitutionPayload).catch((error) => ({ error: error.payload || error.message }))
      : Promise.resolve(null);
    const data = await postJson("/api/plan-target-dish", requestPayload);
    const substitution = await substitutionPromise;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    renderJson(elements.targetRaw, {
      request: requestPayload,
      response: data,
      ingredientSubstitution: substitutionPayload ? { request: substitutionPayload, response: substitution } : null,
    });
    finishOperationStatus(`目标菜规划完成，用时 ${seconds}s。可同时检查画面食材与确认库存的规则对照。`);
    showToast(`目标菜规划完成，用时 ${seconds}s`);
  } catch (error) {
    renderJson(elements.targetRaw, { request: requestPayload, error: error.payload || error.message });
    finishOperationStatus(`目标菜规划失败：${error.message}`);
    showToast("目标菜规划失败");
  } finally {
    setBusy(false);
  }
}

async function previewRetrieval() {
  const inventory = getConfirmedInventory();
  if (!inventory.length) {
    showToast("请先确认至少一个食材");
    return;
  }

  refreshUserContext();
  const isTargetRoute = elements.retrievalRoute.value === "target";
  const requestPayload = {
    inventory,
    userContext,
    retrievalMode: elements.retrievalMode.value,
    limit: 4,
  };
  if (isTargetRoute) {
    const text = elements.targetDishText.value.trim();
    if (!text) {
      showToast("目标菜路线需要先输入菜名");
      return;
    }
    requestPayload.targetDish = {
      text,
      intentTime: elements.targetDishTime.value || "tonight",
      imageAnalysis: targetDishImageAnalysis,
    };
  }

  try {
    setBusy(true);
    const data = await postJson("/api/case-retrieval/preview", requestPayload);
    const target = isTargetRoute ? elements.targetRaw : elements.planRaw;
    renderJson(target, { request: requestPayload, response: data, note: "该接口不调用大模型，只检查结构化 Top-K 和分项分数。" });
    finishOperationStatus(`检索完成：${data.retrieval?.cases?.length || 0} 条，耗时 ${data.trace?.retrievalMs || 0}ms。`);
    showToast("已生成 Top-K 检索结果");
  } catch (error) {
    finishOperationStatus(`检索失败：${error.message}`);
    showToast("检索预览失败");
  } finally {
    setBusy(false);
  }
}

function loadCachedVision() {
  const cached = readCachedVision();
  if (!cached) {
    showToast("暂无上次识别结果");
    return;
  }

  applyVisionResult(cached, `上次模型结果 · ${cached.model || "model"}`);
  finishOperationStatus(`已加载上次识别：${formatCacheTime(cached.cachedAt)}。可直接人工核对并调用晚餐规划。`);
  showToast("已加载上次识别结果");
}

async function copyText(targetId) {
  const target = document.querySelector(`#${targetId}`);
  if (!target?.textContent) return;
  await navigator.clipboard.writeText(target.textContent);
  showToast("已复制 JSON");
}

function setupSpeechInput() {
  if (!window.FridgeSpeech) {
    elements.targetVoiceButton.disabled = true;
    elements.targetVoiceStatus.textContent = "语音模块未加载，可手动输入。";
    return;
  }

  targetVoiceController = window.FridgeSpeech.createSpeechInput({
    button: elements.targetVoiceButton,
    status: elements.targetVoiceStatus,
    onTranscript: applySpeechToTargetDish,
  });
}

elements.fridgeUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  elements.uploadPreview.src = URL.createObjectURL(file);
  elements.uploadPreview.style.display = "block";

  try {
    uploadedImageDataUrl = await fileToDataUrl(file);
    uploadedSourceFileName = file.name;
  } catch (error) {
    uploadedImageDataUrl = "";
    uploadedSourceFileName = "";
    setStatus(error.message || "图片读取失败");
    showToast("图片读取失败");
    setBusy(false);
    return;
  }

  currentVision = { items: [], uncertainItems: [], warnings: [] };
  confirmedItems = new Set();
  renderInventory();
  renderJson(elements.visionRaw, "已加载图片，等待调用视觉识别。");
  renderJson(elements.organizationRaw, "暂无。先完成视觉识别，再点击「检查粗分区」。");
  renderJson(elements.planRaw, "暂无。");
  renderJson(elements.targetRaw, "暂无。");
  setStatus(`已上传：${file.name}。大图会在本地压缩后再发送给模型。`);
  setBusy(false);
});

elements.analyzeButton.addEventListener("click", runVision);
elements.planButton.addEventListener("click", runPlan);
elements.organizationButton.addEventListener("click", runOrganizationPreview);
elements.targetDishAnalyzeButton.addEventListener("click", runTargetDishVision);
elements.targetDishButton.addEventListener("click", runTargetPlan);
elements.cacheVisionButton.addEventListener("click", loadCachedVision);
elements.retrievalPreviewButton.addEventListener("click", previewRetrieval);
elements.lifeLogSampleButton.addEventListener("click", loadLifeLogSample);
elements.lifeLogGenerateButton.addEventListener("click", runLifeLogDraft);
elements.reviewRefreshButton.addEventListener("click", renderReviewData);
elements.lifeLogUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await loadLifeLogFile(file);
    setStatus(`已上传成品图：${file.name}。`);
    setBusy(false);
  } catch (error) {
    lifeLogImageDataUrl = "";
    lifeLogSourceFileName = "";
    renderJson(elements.lifeLogRaw, { error: error.message });
    setStatus(error.message || "成品图读取失败");
    setBusy(false);
  }
});
elements.targetDishText.addEventListener("input", () => {
  elements.targetDishButton.disabled = isBusy || !confirmedItems.size || !elements.targetDishText.value.trim();
});
elements.targetDishUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  elements.targetDishPreview.src = URL.createObjectURL(file);
  elements.targetDishPreview.style.display = "block";

  try {
    targetDishImageDataUrl = await fileToDataUrl(file);
    targetDishSourceFileName = file.name;
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    renderJson(elements.targetRaw, "已加载目标菜图，等待调用目标菜识别。");
    setStatus(`已上传目标菜图：${file.name}。不会覆盖冰箱图片。`);
    setBusy(false);
  } catch (error) {
    targetDishImageDataUrl = "";
    targetDishSourceFileName = "";
    targetDishImageAnalysis = null;
    renderTargetDishGuess();
    setStatus(error.message || "目标菜图片读取失败");
    showToast("目标菜图片读取失败");
    setBusy(false);
  }
});
elements.userSelect.addEventListener("change", async () => {
  await window.FridgeProfile.selectUser(elements.userSelect.value);
  refreshUserContext();
  renderProfile();
  await renderReviewData();
  updateCacheButton(false);
  renderJson(elements.planRaw, { userContext, note: "已切换演示用户，晚餐规划会使用该用户画像。" });
  renderJson(elements.targetRaw, { userContext, note: "已切换演示用户，目标菜复刻也会使用该用户画像。" });
  showToast(`已切换用户：${elements.userSelect.options[elements.userSelect.selectedIndex].textContent}`);
});
document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

async function initializeDev() {
  await window.FridgeProfile.init();
  refreshUserContext();
  setupSpeechInput();
  await checkHealth();
  renderInventory();
  renderProfile();
  await renderReviewData();
  renderTargetDishGuess();
  updateCacheButton(false);
}

initializeDev();
