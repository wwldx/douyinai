import { timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DEFAULT_COLLECTION = "agent_runs";
const DEFAULT_RETENTION_DAYS = 7;
const MAX_RUNS_PER_READ = 200;
const BLOCKED_FIELD = /^(?:imageDataUrl|audioDataUrl|apiKey|authorization|secret|secretId|secretKey|transcript|description|sourceFileName|raw|rawRequest|rawResponse|rawPayload)$/i;

export function createAgentRunStore({ runtimeDataRoot, isProduction = false, env = process.env } = {}) {
  const enabled = env.AGENT_RUNS_ENABLED === "true";
  const backend = normalizeBackend(env.AGENT_RUNS_BACKEND, isProduction);
  const collectionName = normalizeCollectionName(env.AGENT_RUNS_COLLECTION);
  const retentionDays = boundedInteger(env.AGENT_RUNS_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, 30);
  const captureContent = env.AGENT_RUNS_CAPTURE_CONTENT === "true";
  const configuredAdminToken = String(env.AGENT_RUNS_ADMIN_TOKEN || "").trim();
  const adminToken = configuredAdminToken.length >= 24 ? configuredAdminToken : "";
  const autoCreateCollection = env.AGENT_RUNS_AUTO_CREATE_COLLECTION === "true";
  const appVersion = safeText(env.AGENT_APP_VERSION || "011-local", 40);
  const localPath = join(runtimeDataRoot, "local-agent-runs", "agent-runs.ndjson");
  const cloudbaseEnvId = String(env.CLOUDBASE_ENV_ID || env.TCB_ENV || "").trim();
  const cloudbaseRegion = String(env.CLOUDBASE_REGION || "ap-shanghai").trim();

  let cloudDbPromise = null;
  let state = enabled ? "configured" : "disabled";
  let lastWriteAt = null;
  let lastErrorAt = null;
  let lastErrorCode = null;
  let lastCleanupAt = 0;

  function health() {
    return {
      enabled,
      backend,
      state,
      captureContent,
      retentionDays,
      collection: backend === "cloudbase" ? collectionName : null,
      adminApiEnabled: Boolean(adminToken),
      appVersion,
      lastWriteAt,
      lastErrorAt,
      lastErrorCode,
    };
  }

  function shouldTrack(pathname) {
    return enabled && TRACKED_AGENT_PATHS.has(pathname);
  }

  function isAdminAuthorized(candidate) {
    if (!adminToken || !candidate) return false;
    const expected = Buffer.from(adminToken);
    const received = Buffer.from(String(candidate));
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async function record(run) {
    if (!enabled) return { recorded: false, reason: "disabled" };
    const document = buildRunDocument(run, {
      appVersion,
      captureContent,
      retentionDays,
    });

    try {
      if (backend === "cloudbase") await writeCloudDocument(document);
      else await writeLocalDocument(document);
      state = "ready";
      lastWriteAt = new Date().toISOString();
      lastErrorAt = null;
      lastErrorCode = null;
      void maybePruneExpired();
      return { recorded: true };
    } catch (error) {
      markError(error);
      console.error(JSON.stringify({
        type: "agent_run_store_error",
        requestId: document.requestId,
        backend,
        code: error?.code || error?.name || "AGENT_RUN_STORE_ERROR",
      }));
      return { recorded: false, reason: "store-error" };
    }
  }

  async function list({ limit = 50 } = {}) {
    assertEnabled();
    const safeLimit = boundedInteger(limit, 50, 1, MAX_RUNS_PER_READ);
    try {
      await maybePruneExpired();
      const runs = backend === "cloudbase"
        ? await readCloudDocuments(safeLimit)
        : await readLocalDocuments(safeLimit);
      state = "ready";
      return runs;
    } catch (error) {
      markError(error);
      throw publicStoreError(error);
    }
  }

  async function clear({ scope = "expired" } = {}) {
    assertEnabled();
    if (!new Set(["expired", "all"]).has(scope)) {
      throw Object.assign(new Error("不支持的清理范围。"), { status: 400, code: "INVALID_CLEAR_SCOPE" });
    }
    try {
      const removed = backend === "cloudbase"
        ? await clearCloudDocuments(scope)
        : await clearLocalDocuments(scope);
      state = "ready";
      lastCleanupAt = Date.now();
      return { removed };
    } catch (error) {
      markError(error);
      throw publicStoreError(error);
    }
  }

  async function getCloudDb() {
    if (cloudDbPromise) return cloudDbPromise;
    cloudDbPromise = (async () => {
      if (!cloudbaseEnvId) {
        throw Object.assign(new Error("缺少 CLOUDBASE_ENV_ID。"), { code: "CLOUDBASE_ENV_MISSING" });
      }
      const imported = await import("@cloudbase/js-sdk");
      const cloudbase = imported.default || imported;
      const initOptions = { env: cloudbaseEnvId, region: cloudbaseRegion };
      const explicitSecretId = String(env.CLOUDBASE_SECRET_ID || "").trim();
      const explicitSecretKey = String(env.CLOUDBASE_SECRET_KEY || "").trim();
      if (explicitSecretId && explicitSecretKey) {
        initOptions.secretId = explicitSecretId;
        initOptions.secretKey = explicitSecretKey;
      }
      const app = cloudbase.init(initOptions);
      const db = app.database();
      if (autoCreateCollection) {
        try {
          const creation = await db.createCollection(collectionName);
          if (creation?.code && !isCollectionAlreadyExists(creation)) {
            throw Object.assign(new Error("CloudBase 集合创建失败。"), { code: creation.code });
          }
        } catch (error) {
          if (!isCollectionAlreadyExists(error)) throw error;
        }
      }
      return db;
    })();
    return cloudDbPromise;
  }

  async function writeCloudDocument(document) {
    const db = await getCloudDb();
    await db.collection(collectionName).add(document);
  }

  async function readCloudDocuments(limit) {
    const db = await getCloudDb();
    const collection = db.collection(collectionName);
    let result;
    try {
      result = await collection.orderBy("createdAtMs", "desc").limit(limit).get();
    } catch {
      result = await collection.limit(Math.max(limit, 100)).get();
    }
    return activeRuns(result?.data || []).sort(sortNewestFirst).slice(0, limit);
  }

  async function clearCloudDocuments(scope) {
    const db = await getCloudDb();
    const result = await db.collection(collectionName).limit(1000).get();
    const now = Date.now();
    const targets = (result?.data || []).filter((run) => scope === "all" || Number(run.expiresAtMs || 0) <= now);
    let removed = 0;
    for (const run of targets) {
      if (!run?._id) continue;
      await db.collection(collectionName).doc(run._id).remove();
      removed += 1;
    }
    return removed;
  }

  async function writeLocalDocument(document) {
    await mkdir(dirname(localPath), { recursive: true });
    await appendFile(localPath, `${JSON.stringify(document)}\n`, "utf8");
  }

  async function readLocalDocuments(limit) {
    const runs = await readLocalRunFile();
    return activeRuns(runs).sort(sortNewestFirst).slice(0, limit);
  }

  async function clearLocalDocuments(scope) {
    const runs = await readLocalRunFile();
    const now = Date.now();
    const retained = scope === "all" ? [] : runs.filter((run) => Number(run.expiresAtMs || 0) > now);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, retained.map((run) => JSON.stringify(run)).join("\n") + (retained.length ? "\n" : ""), "utf8");
    return runs.length - retained.length;
  }

  async function readLocalRunFile() {
    let text = "";
    try {
      text = await readFile(localPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }

  async function maybePruneExpired(force = false) {
    if (!enabled) return;
    const now = Date.now();
    if (!force && now - lastCleanupAt < 30 * 60 * 1000) return;
    lastCleanupAt = now;
    try {
      if (backend === "cloudbase") await clearCloudDocuments("expired");
      else await clearLocalDocuments("expired");
    } catch (error) {
      markError(error);
    }
  }

  function assertEnabled() {
    if (!enabled) {
      throw Object.assign(new Error("Agent 运行记录未启用。"), { status: 503, code: "AGENT_RUNS_DISABLED" });
    }
  }

  function markError(error) {
    state = "error";
    lastErrorAt = new Date().toISOString();
    lastErrorCode = safeText(error?.code || error?.name || "AGENT_RUN_STORE_ERROR", 80);
  }

  return {
    health,
    shouldTrack,
    isAdminAuthorized,
    record,
    list,
    clear,
  };
}

export const TRACKED_AGENT_PATHS = new Set([
  "/api/analyze-fridge",
  "/api/analyze-target-dish",
  "/api/generate-life-log",
  "/api/rescue-dish",
  "/api/transcribe-audio",
  "/api/case-retrieval/preview",
  "/api/ingredient-substitution",
  "/api/eat-first",
  "/api/fridge-organization",
  "/api/plan-dinner",
  "/api/plan-target-dish",
]);

function buildRunDocument(run, { appVersion, captureContent, retentionDays }) {
  const now = Date.now();
  const status = boundedInteger(run?.status, 500, 100, 599);
  const document = {
    schemaVersion: 1,
    requestId: safeIdentifier(run?.requestId, 80),
    sessionId: safeIdentifier(run?.sessionId, 80) || null,
    appVersion,
    route: safeText(run?.route, 100),
    method: safeText(run?.method, 12),
    status,
    outcome: status < 400 ? "success" : "error",
    source: safeText(run?.source || (status < 400 ? "unknown" : "request-error"), 80),
    agent: safeText(run?.agent, 80) || null,
    provider: safeText(run?.provider, 80) || null,
    model: safeText(run?.model, 80) || null,
    durationMs: nonNegativeNumber(run?.durationMs),
    trace: sanitizeValue(run?.trace) || null,
    usage: sanitizeValue(run?.usage) || null,
    inputSummary: sanitizeValue(run?.inputSummary) || null,
    outputSummary: sanitizeValue(run?.outputSummary) || null,
    error: sanitizeValue(run?.error) || null,
    captureMode: captureContent ? "structured" : "metadata-only",
    createdAt: new Date(now),
    createdAtMs: now,
    expiresAt: new Date(now + retentionDays * 24 * 60 * 60 * 1000),
    expiresAtMs: now + retentionDays * 24 * 60 * 60 * 1000,
  };
  if (captureContent && run?.content) document.content = sanitizeValue(run.content);
  return document;
}

function sanitizeValue(value, key = "", depth = 0) {
  if (BLOCKED_FIELD.test(key) || depth > 6 || value === undefined) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (/^data:(?:image|audio)\//i.test(value)) return "[media omitted]";
    return safeText(value, 500);
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeValue(item, key, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      const sanitized = sanitizeValue(childValue, childKey, depth + 1);
      if (sanitized !== undefined) output[childKey] = sanitized;
    }
    return output;
  }
  return undefined;
}

function normalizeBackend(value, isProduction) {
  const backend = String(value || "").trim().toLowerCase();
  if (backend === "cloudbase" || backend === "file") return backend;
  return isProduction ? "cloudbase" : "file";
}

function normalizeCollectionName(value) {
  const name = String(value || DEFAULT_COLLECTION).trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) ? name : DEFAULT_COLLECTION;
}

function isCollectionAlreadyExists(value) {
  const text = `${value?.code || ""} ${value?.message || value?.error || ""}`;
  return /already.?exist|collection.?already|DATABASE_COLLECTION_ALREADY_EXIST/i.test(text);
}

function publicStoreError(error) {
  return Object.assign(new Error("运行记录存储暂时不可用，请检查 CloudBase 数据库与权限配置。"), {
    status: 503,
    code: safeText(error?.code || error?.name || "AGENT_RUN_STORE_ERROR", 80),
  });
}

function activeRuns(runs) {
  const now = Date.now();
  return runs.filter((run) => Number(run?.expiresAtMs || 0) > now);
}

function sortNewestFirst(left, right) {
  return Number(right?.createdAtMs || 0) - Number(left?.createdAtMs || 0);
}

function safeIdentifier(value, maxLength) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9._:-]+$/.test(text) ? text.slice(0, maxLength) : "";
}

function safeText(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function nonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}
