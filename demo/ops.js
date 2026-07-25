const TOKEN_KEY = "fridgeDinner:agentRunsAdminToken:v1";

const elements = {
  token: document.querySelector("#tokenInput"),
  connect: document.querySelector("#connectButton"),
  refresh: document.querySelector("#refreshButton"),
  clearExpired: document.querySelector("#clearExpiredButton"),
  clearAll: document.querySelector("#clearAllButton"),
  badge: document.querySelector("#connectionBadge"),
  message: document.querySelector("#message"),
  runCount: document.querySelector("#runCount"),
  successRate: document.querySelector("#successRate"),
  averageLatency: document.querySelector("#averageLatency"),
  captureMode: document.querySelector("#captureMode"),
  storeState: document.querySelector("#storeState"),
  search: document.querySelector("#searchInput"),
  route: document.querySelector("#routeFilter"),
  status: document.querySelector("#statusFilter"),
  rows: document.querySelector("#runRows"),
  empty: document.querySelector("#emptyState"),
  detail: document.querySelector("#detailPanel"),
  detailTitle: document.querySelector("#detailTitle"),
  detailJson: document.querySelector("#detailJson"),
  closeDetail: document.querySelector("#closeDetailButton"),
};

let runs = [];
let health = null;

try {
  elements.token.value = window.sessionStorage.getItem(TOKEN_KEY) || "";
} catch {
  // Session storage is optional.
}

elements.connect.addEventListener("click", connect);
elements.refresh.addEventListener("click", loadRuns);
elements.clearExpired.addEventListener("click", () => clearRuns("expired"));
elements.clearAll.addEventListener("click", () => clearRuns("all"));
elements.search.addEventListener("input", renderRuns);
elements.route.addEventListener("change", renderRuns);
elements.status.addEventListener("change", renderRuns);
elements.closeDetail.addEventListener("click", () => { elements.detail.hidden = true; });

async function connect() {
  const token = elements.token.value.trim();
  if (!token) {
    showMessage("请输入管理员令牌。", true);
    return;
  }
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Keeping the token in the current input is sufficient.
  }
  await loadRuns();
}

async function loadRuns() {
  setBusy(true);
  showMessage("正在读取运行记录…");
  try {
    const payload = await adminRequest("GET", "/api/admin/agent-runs?limit=200");
    runs = Array.isArray(payload.runs) ? payload.runs : [];
    health = payload.health || null;
    setConnected(true);
    updateRouteOptions();
    renderMetrics();
    renderRuns();
    showMessage(`已读取 ${runs.length} 条记录。`);
  } catch (error) {
    setConnected(false);
    showMessage(error.message || "读取失败。", true);
  } finally {
    setBusy(false);
  }
}

async function clearRuns(scope) {
  const prompt = scope === "all" ? "确定清空全部运行记录？此操作不可恢复。" : "确定清理已经到期的运行记录？";
  if (!window.confirm(prompt)) return;
  setBusy(true);
  try {
    const suffix = scope === "all" ? "&confirm=clear" : "";
    const payload = await adminRequest("DELETE", `/api/admin/agent-runs?scope=${scope}${suffix}`);
    showMessage(`已清理 ${payload.removed || 0} 条记录。`);
    await loadRuns();
  } catch (error) {
    showMessage(error.message || "清理失败。", true);
  } finally {
    setBusy(false);
  }
}

async function adminRequest(method, url) {
  const token = elements.token.value.trim();
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

function updateRouteOptions() {
  const current = elements.route.value;
  const routes = [...new Set(runs.map((run) => run.route).filter(Boolean))].sort();
  elements.route.replaceChildren(new Option("全部路由", ""), ...routes.map((route) => new Option(routeLabel(route), route)));
  if (routes.includes(current)) elements.route.value = current;
}

function renderMetrics() {
  const successful = runs.filter((run) => run.outcome === "success").length;
  const durations = runs.map((run) => Number(run.durationMs)).filter(Number.isFinite);
  const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  elements.runCount.textContent = String(runs.length);
  elements.successRate.textContent = runs.length ? `${Math.round((successful / runs.length) * 100)}%` : "-";
  elements.averageLatency.textContent = average === null ? "-" : formatDuration(average);
  elements.captureMode.textContent = health?.captureContent ? "结构化" : "仅元数据";
  elements.storeState.textContent = `${health?.backend || "-"} / ${health?.state || "-"}`;
}

function renderRuns() {
  const query = elements.search.value.trim().toLowerCase();
  const route = elements.route.value;
  const status = elements.status.value;
  const filtered = runs.filter((run) => {
    if (route && run.route !== route) return false;
    if (status && run.outcome !== status) return false;
    if (!query) return true;
    return [run.requestId, run.sessionId, run.route, run.source, run.agent, run.model]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });

  elements.rows.replaceChildren(...filtered.map(createRunRow));
  elements.empty.hidden = filtered.length > 0;
  if (!filtered.length) elements.empty.textContent = runs.length ? "当前筛选没有匹配记录。" : "还没有运行记录。";
}

function createRunRow(run) {
  const row = document.createElement("tr");
  appendCell(row, formatDate(run.createdAtMs));
  appendCell(row, routeLabel(run.route), "route-name");
  appendCell(row, run.source || "-", "source-name");
  appendCell(row, `${run.status || "-"} ${run.outcome === "success" ? "成功" : "失败"}`, run.outcome === "success" ? "run-success" : "run-error");
  appendCell(row, formatDuration(run.durationMs));
  appendCell(row, summarizeRun(run), "summary-cell");

  const requestCell = document.createElement("td");
  requestCell.className = "request-cell";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = String(run.requestId || "查看").slice(0, 8);
  button.title = run.requestId || "查看详情";
  button.addEventListener("click", () => showDetail(run));
  requestCell.append(button);
  row.append(requestCell);
  return row;
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = String(value ?? "-");
  if (className) cell.className = className;
  row.append(cell);
}

function summarizeRun(run) {
  const input = run.inputSummary || {};
  const output = run.outputSummary || {};
  const pieces = [];
  if (input.itemCount !== undefined) pieces.push(`库存 ${input.itemCount} 项`);
  if (input.media?.type) pieces.push(`${input.media.type} ${formatBytes(input.media.approximateBytes)}`);
  if (output.confirmedItemCount !== undefined) pieces.push(`确认 ${output.confirmedItemCount} 项`);
  if (output.uncertainItemCount) pieces.push(`待确认 ${output.uncertainItemCount} 项`);
  if (output.missingCriticalCount !== undefined) pieces.push(`缺主料 ${output.missingCriticalCount} 项`);
  if (output.mustBuyCount !== undefined) pieces.push(`需补买 ${output.mustBuyCount} 项`);
  if (output.stepCount) pieces.push(`${output.stepCount} 步`);
  if (output.transcriptLength !== undefined) pieces.push(`转写 ${output.transcriptLength} 字`);
  if (run.error?.code) pieces.push(`错误 ${run.error.code}`);
  return pieces.join(" · ") || "已记录来源、耗时与状态";
}

function showDetail(run) {
  elements.detail.hidden = false;
  elements.detailTitle.textContent = `${routeLabel(run.route)} · ${run.requestId || ""}`;
  elements.detailJson.textContent = JSON.stringify(run, null, 2);
  elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setConnected(connected) {
  elements.badge.textContent = connected ? "已连接" : "未连接";
  elements.badge.className = `status-badge ${connected ? "ready" : "error"}`;
  elements.refresh.disabled = !connected;
  elements.clearExpired.disabled = !connected;
  elements.clearAll.disabled = !connected;
}

function setBusy(busy) {
  elements.connect.disabled = busy;
  if (busy) {
    elements.refresh.disabled = true;
    elements.clearExpired.disabled = true;
    elements.clearAll.disabled = true;
  } else if (health) {
    elements.refresh.disabled = false;
    elements.clearExpired.disabled = false;
    elements.clearAll.disabled = false;
  }
}

function showMessage(message, error = false) {
  elements.message.textContent = message || "";
  elements.message.style.color = error ? "#a43e2c" : "#52605a";
}

function routeLabel(route) {
  const labels = {
    "/api/analyze-fridge": "识别冰箱",
    "/api/analyze-target-dish": "识别目标菜",
    "/api/plan-dinner": "自由晚餐规划",
    "/api/plan-target-dish": "目标菜规划",
    "/api/rescue-dish": "做菜救援",
    "/api/transcribe-audio": "语音转写",
    "/api/generate-life-log": "生活记录草稿",
    "/api/eat-first": "先吃清单",
    "/api/fridge-organization": "冰箱整理",
    "/api/ingredient-substitution": "食材替代",
    "/api/case-retrieval/preview": "Case 检索",
  };
  return labels[route] || route || "未知路由";
}

function formatDate(value) {
  const date = new Date(Number(value) || value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return "-";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
