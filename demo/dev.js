let userContext = window.FridgeProfile.buildUserContext();

const elements = {
  healthBadge: document.querySelector("#healthBadge"),
  fridgeUpload: document.querySelector("#fridgeUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  analyzeButton: document.querySelector("#analyzeButton"),
  planButton: document.querySelector("#planButton"),
  cacheVisionButton: document.querySelector("#cacheVisionButton"),
  statusText: document.querySelector("#statusText"),
  userSelect: document.querySelector("#userSelect"),
  profileTraits: document.querySelector("#profileTraits"),
  feedbackActions: document.querySelector("#feedbackActions"),
  visionMeta: document.querySelector("#visionMeta"),
  inventoryList: document.querySelector("#inventoryList"),
  uncertainBox: document.querySelector("#uncertainBox"),
  visionRaw: document.querySelector("#visionRaw"),
  planRaw: document.querySelector("#planRaw"),
  toast: document.querySelector("#toast"),
};

let uploadedImageDataUrl = "";
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
    const data = await postJson("/api/analyze-fridge", { imageDataUrl: uploadedImageDataUrl });
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

elements.fridgeUpload.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  elements.uploadPreview.src = URL.createObjectURL(file);
  elements.uploadPreview.style.display = "block";

  try {
    uploadedImageDataUrl = await fileToDataUrl(file);
  } catch (error) {
    uploadedImageDataUrl = "";
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
  setStatus(`已上传：${file.name}。大图会在本地压缩后再发送给模型。`);
  setBusy(false);
});

elements.analyzeButton.addEventListener("click", runVision);
elements.planButton.addEventListener("click", runPlan);
elements.cacheVisionButton.addEventListener("click", loadCachedVision);
elements.userSelect.addEventListener("change", async () => {
  await window.FridgeProfile.selectUser(elements.userSelect.value);
  refreshUserContext();
  renderProfile();
  updateCacheButton(false);
  renderJson(elements.planRaw, { userContext, note: "已切换演示用户，晚餐规划会使用该用户画像。" });
  showToast(`已切换用户：${elements.userSelect.options[elements.userSelect.selectedIndex].textContent}`);
});
document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

async function initializeDev() {
  await window.FridgeProfile.init();
  refreshUserContext();
  await checkHealth();
  renderInventory();
  renderProfile();
  updateCacheButton(false);
}

initializeDev();
