const userContext = {
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

const elements = {
  healthBadge: document.querySelector("#healthBadge"),
  fridgeUpload: document.querySelector("#fridgeUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  analyzeButton: document.querySelector("#analyzeButton"),
  planButton: document.querySelector("#planButton"),
  statusText: document.querySelector("#statusText"),
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

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setBusy(isBusy) {
  elements.analyzeButton.disabled = isBusy || !uploadedImageDataUrl;
  elements.planButton.disabled = isBusy || !confirmedItems.size;
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
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
    setStatus("正在调用 /api/analyze-fridge。");
    renderJson(elements.visionRaw, "请求中...");
    const data = await postJson("/api/analyze-fridge", { imageDataUrl: uploadedImageDataUrl });
    currentVision = normalizeVision(data.vision);
    confirmedItems = new Set(currentVision.items.map((item) => item.name));
    renderInventory();
    renderJson(elements.visionRaw, data);
    elements.visionMeta.textContent = `${data.provider || "provider"} · ${data.model || "model"} · ${confirmedItems.size}/${currentVision.items.length} 已确认`;
    setStatus("视觉识别完成。请人工核对库存是否符合原图。");
    showToast("视觉识别完成");
  } catch (error) {
    currentVision = { items: [], uncertainItems: [], warnings: [] };
    confirmedItems = new Set();
    renderInventory();
    renderJson(elements.visionRaw, error.payload || { error: error.message });
    setStatus(`视觉识别失败：${error.message}`);
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

  const requestPayload = { inventory, userContext };
  try {
    setBusy(true);
    setStatus("正在调用 /api/plan-dinner。");
    renderJson(elements.planRaw, { request: requestPayload, response: "请求中..." });
    const data = await postJson("/api/plan-dinner", requestPayload);
    renderJson(elements.planRaw, { request: requestPayload, response: data });
    setStatus("晚餐规划完成。可检查 request.inventory 是否就是你人工确认后的库存。");
    showToast("晚餐规划完成");
  } catch (error) {
    renderJson(elements.planRaw, { request: requestPayload, error: error.payload || error.message });
    setStatus(`晚餐规划失败：${error.message}`);
    showToast("晚餐规划失败");
  } finally {
    setBusy(false);
  }
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
  uploadedImageDataUrl = await fileToDataUrl(file);
  currentVision = { items: [], uncertainItems: [], warnings: [] };
  confirmedItems = new Set();
  renderInventory();
  renderJson(elements.visionRaw, "已加载图片，等待调用视觉识别。");
  renderJson(elements.planRaw, "暂无。");
  setStatus(`已上传：${file.name}。`);
  setBusy(false);
});

elements.analyzeButton.addEventListener("click", runVision);
elements.planButton.addEventListener("click", runPlan);
document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

checkHealth();
renderInventory();
