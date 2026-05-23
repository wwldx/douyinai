let userContext = window.FridgeProfile.buildUserContext();

const elements = {
  healthBadge: document.querySelector("#healthBadge"),
  fridgeUpload: document.querySelector("#fridgeUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  analyzeButton: document.querySelector("#analyzeButton"),
  planButton: document.querySelector("#planButton"),
  cacheVisionButton: document.querySelector("#cacheVisionButton"),
  targetDishUpload: document.querySelector("#targetDishUpload"),
  targetDishPreview: document.querySelector("#targetDishPreview"),
  targetDishGuess: document.querySelector("#targetDishGuess"),
  targetDishText: document.querySelector("#targetDishText"),
  targetVoiceButton: document.querySelector("#targetVoiceButton"),
  targetVoiceStatus: document.querySelector("#targetVoiceStatus"),
  targetDishTime: document.querySelector("#targetDishTime"),
  targetDishAnalyzeButton: document.querySelector("#targetDishAnalyzeButton"),
  targetDishButton: document.querySelector("#targetDishButton"),
  statusText: document.querySelector("#statusText"),
  userSelect: document.querySelector("#userSelect"),
  profileTraits: document.querySelector("#profileTraits"),
  feedbackActions: document.querySelector("#feedbackActions"),
  visionMeta: document.querySelector("#visionMeta"),
  inventoryList: document.querySelector("#inventoryList"),
  uncertainBox: document.querySelector("#uncertainBox"),
  visionRaw: document.querySelector("#visionRaw"),
  planRaw: document.querySelector("#planRaw"),
  targetRaw: document.querySelector("#targetRaw"),
  toast: document.querySelector("#toast"),
};

let uploadedImageDataUrl = "";
let uploadedSourceFileName = "";
let targetDishImageDataUrl = "";
let targetDishSourceFileName = "";
let targetDishImageAnalysis = null;
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
  elements.targetDishAnalyzeButton.disabled = busy || !targetDishImageDataUrl;
  elements.targetDishButton.disabled = busy || !confirmedItems.size || !elements.targetDishText.value.trim();
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

function renderTargetDishGuess() {
  if (!targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "可直接输入目标菜，也可以上传菜图后点击「识别目标菜」。";
    return;
  }

  if (targetDishImageDataUrl && !targetDishImageAnalysis) {
    elements.targetDishGuess.innerHTML = "已上传目标菜图，等待识别。识别后仍可手动修改目标菜名。";
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

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    elements.healthBadge.textContent = `${health.provider} · ${health.model} · key:${health.hasApiKey ? "yes" : "no"}`;
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
  const requestPayload = { inventory, userContext };
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
  };

  try {
    setBusy(true);
    const startedAt = startOperationStatus("target", "正在调用 /api/plan-target-dish");
    renderJson(elements.targetRaw, { request: requestPayload, response: "请求中..." });
    const data = await postJson("/api/plan-target-dish", requestPayload);
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    renderJson(elements.targetRaw, { request: requestPayload, response: data });
    finishOperationStatus(`目标菜复刻规划完成，用时 ${seconds}s。可检查缺料、难点提醒和 commerceCards。`);
    showToast(`目标菜规划完成，用时 ${seconds}s`);
  } catch (error) {
    renderJson(elements.targetRaw, { request: requestPayload, error: error.payload || error.message });
    finishOperationStatus(`目标菜规划失败：${error.message}`);
    showToast("目标菜规划失败");
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
  renderJson(elements.planRaw, "暂无。");
  renderJson(elements.targetRaw, "暂无。");
  setStatus(`已上传：${file.name}。大图会在本地压缩后再发送给模型。`);
  setBusy(false);
});

elements.analyzeButton.addEventListener("click", runVision);
elements.planButton.addEventListener("click", runPlan);
elements.targetDishAnalyzeButton.addEventListener("click", runTargetDishVision);
elements.targetDishButton.addEventListener("click", runTargetPlan);
elements.cacheVisionButton.addEventListener("click", loadCachedVision);
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
  renderTargetDishGuess();
  updateCacheButton(false);
}

initializeDev();
