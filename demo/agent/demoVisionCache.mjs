import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const CACHE_FILES = {
  fridge: "fridge.json",
  targetDish: "target-dishes.json",
  lifeLog: "life-log.json",
  dishRescue: "dish-rescue.json",
};

const CACHE_PAYLOAD_KEYS = {
  fridge: "vision",
  targetDish: "targetVision",
  lifeLog: "lifeLog",
  dishRescue: "dishRescue",
};

export function createDemoVisionCache(dataRoot, options = {}) {
  const seedDir = join(dataRoot, "demo-cache", "vision");
  const localDir = join(dataRoot, "local-cache", "vision");
  const fallbackMs = Number(options.fallbackMs || process.env.DEMO_VISION_CACHE_FALLBACK_MS || 4500);
  const enabled = process.env.DEMO_VISION_CACHE_ENABLED !== "false";
  const memory = new Map();

  async function find(kind, request) {
    if (!enabled) return null;
    const registry = await loadRegistry(kind);
    const fileName = normalizeFileName(request?.sourceFileName);
    const demoKey = normalizeFileName(request?.demoKey);
    const imageHash = hashDataUrl(request?.imageDataUrl);
    const signature = requestSignature(kind, request);

    for (const entry of registry.entries) {
      if (kind === "dishRescue" && (!signature || normalizeSignature(entry.requestSignature) !== signature)) continue;
      const hashes = normalizeList([entry.imageHash, ...(entry.imageHashes || [])]);
      if (imageHash && hashes.includes(imageHash)) {
        return { entry, matchedBy: "imageHash", key: imageHash };
      }

      const cacheKeys = normalizeList(entry.cacheKeys || []);
      if (demoKey && cacheKeys.includes(demoKey)) {
        return { entry, matchedBy: "demoKey", key: demoKey };
      }

      if (request?.allowFileNameMatch === true || !["fridge", "targetDish", "dishRescue"].includes(kind)) {
        const names = normalizeList([entry.fileName, ...(entry.fileNames || [])]);
        if (fileName && names.includes(fileName)) {
          return { entry, matchedBy: "fileName", key: fileName };
        }
      }
    }

    return null;
  }

  async function saveRuntime(kind, request, result) {
    if (!enabled || !result) return;
    const fileName = normalizeFileName(request?.sourceFileName);
    const imageHash = hashDataUrl(request?.imageDataUrl);
    const signature = requestSignature(kind, request);
    if (!fileName && !imageHash) return;
    if (kind === "dishRescue" && !signature) return;

    const cacheFile = CACHE_FILES[kind];
    if (!cacheFile) return;

    const filePath = join(localDir, `runtime-${cacheFile}`);
    await mkdir(localDir, { recursive: true });
    const existing = await readJson(filePath, { version: 1, entries: [] });
    const entries = Array.isArray(existing.entries) ? existing.entries : [];
    const payloadKey = CACHE_PAYLOAD_KEYS[kind];
    const cacheKey = [imageHash || fileName, signature].filter(Boolean).join("-");
    const nextEntry = {
      id: `runtime-${kind}-${cacheKey}`,
      fileName,
      imageHash,
      ...(signature ? { requestSignature: signature } : {}),
      sourcePath: request?.sourceFileName || "",
      cachedAt: new Date().toISOString(),
      [payloadKey]: result,
    };

    const filtered = entries.filter((entry) => {
      const sameFile = fileName && normalizeFileName(entry.fileName) === fileName;
      const sameHash = imageHash && normalizeFileName(entry.imageHash) === imageHash;
      const sameSignature = !signature || normalizeSignature(entry.requestSignature) === signature;
      return !((sameFile || sameHash) && sameSignature);
    });

    await writeFile(filePath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: [nextEntry, ...filtered].slice(0, 40) }, null, 2)}\n`);
    memory.delete(kind);
  }

  async function race(kind, request, runModel) {
    const cached = await find(kind, request);
    const payloadKey = CACHE_PAYLOAD_KEYS[kind];

    const modelPromise = Promise.resolve()
      .then(runModel)
      .then(async (result) => {
        await saveRuntime(kind, request, result);
        return { source: "model", result };
      })
      .catch((error) => {
        if (cached?.entry?.[payloadKey]) {
          return { source: "model-error-cache", result: cached.entry[payloadKey], cache: formatCacheMeta(cached), modelError: error.message };
        }
        throw error;
      });

    if (!cached?.entry?.[payloadKey]) {
      return modelPromise;
    }

    const cachePromise = delay(fallbackMs).then(() => ({
      source: "model-timeout-cache",
      result: cached.entry[payloadKey],
      cache: formatCacheMeta(cached),
    }));

    return Promise.race([modelPromise, cachePromise]);
  }

  async function loadRegistry(kind) {
    if (memory.has(kind)) return memory.get(kind);
    const cacheFile = CACHE_FILES[kind];
    if (!cacheFile) return { version: 1, entries: [] };

    const seed = await readJson(join(seedDir, cacheFile), { version: 1, entries: [] });
    const runtime = await readJson(join(localDir, `runtime-${cacheFile}`), { version: 1, entries: [] });
    const registry = {
      version: 1,
      entries: [
        ...(Array.isArray(seed.entries) ? seed.entries : []),
        ...(Array.isArray(runtime.entries) ? runtime.entries : []),
      ],
    };
    memory.set(kind, registry);
    return registry;
  }

  return {
    enabled,
    fallbackMs,
    find,
    race,
    saveRuntime,
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeList(values) {
  return values.map((value) => normalizeFileName(value)).filter(Boolean);
}

function normalizeFileName(value) {
  if (!value) return "";
  return basename(String(value)).normalize("NFKC").trim().toLowerCase();
}

function normalizeSignature(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function requestSignature(kind, request) {
  if (kind !== "dishRescue") return "";
  const explicit = normalizeSignature(request?.requestSignature);
  if (explicit) return explicit;
  const category = normalizeSignature(request?.category);
  const symptom = normalizeSignature(request?.symptom);
  return category && symptom ? `${category}|${symptom}` : "";
}

function hashDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^,]+,(.+)$/);
  if (!match) return "";
  return createHash("sha256").update(match[1]).digest("hex");
}

function formatCacheMeta(match) {
  return {
    matchedBy: match.matchedBy,
    key: match.key,
    id: match.entry.id || "",
    fileName: match.entry.fileName || "",
    sourcePath: match.entry.sourcePath || "",
    cachedAt: match.entry.cachedAt || "",
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
