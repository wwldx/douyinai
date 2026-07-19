const zoneDefinitions = {
  door: { label: "门架", confidence: 0.94 },
  top: { label: "上层", confidence: 0.88 },
  middle: { label: "中层", confidence: 0.88 },
  bottom: { label: "下层", confidence: 0.88 },
  crisper: { label: "抽屉", confidence: 0.94 },
  freezer: { label: "冷冻区", confidence: 0.94 },
  unknown: { label: "位置待确认", confidence: 0 },
};

const urgencyStatuses = new Set(["opened", "label_soon", "opened_label_soon"]);
const storageConfirmationValues = new Set([
  "not_confirmed",
  "original_carton",
  "raw_sealed_leakproof",
  "uncut_produce",
]);
const layoutZoneOrder = ["top", "middle", "bottom", "crisper", "door", "freezer"];

function cleanText(value, maxLength = 80) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

function zoneResult(zone, evidence, reason = "") {
  const definition = zoneDefinitions[zone] || zoneDefinitions.unknown;
  return {
    approximateZone: zone,
    zoneLabel: definition.label,
    zoneConfidence: definition.confidence,
    evidence,
    reason,
  };
}

export function normalizeApproximateZone(notes) {
  const text = cleanText(notes);
  if (!text) return zoneResult("unknown", "", "视觉结果没有提供可复核的位置描述。");

  const hasFreezer = /(冷冻|冻层|冰柜)/.test(text);
  const hasDoor = /(门架|冰箱门|门侧)/.test(text);
  const hasCrisper = /(抽屉|果蔬盒|果蔬格|保鲜抽屉)/.test(text);
  const levels = [];
  if (/(上层|顶层|上格)/.test(text)) levels.push("top");
  if (/(中层|中间层|中格)/.test(text)) levels.push("middle");
  if (/(下层|底层|底部|下格|中下层)/.test(text)) levels.push("bottom");

  const structuralZones = [hasFreezer && "freezer", hasDoor && "door", hasCrisper && "crisper"].filter(Boolean);
  if (structuralZones.length > 1) {
    return zoneResult("unknown", text, "同一描述出现多个分区，不能可靠决定当前位置。");
  }
  if (hasFreezer) return zoneResult("freezer", text);
  if (hasCrisper) return zoneResult("crisper", text);
  if (hasDoor) {
    if (levels.length && /(和|及|、|\/|&)/.test(text)) {
      return zoneResult("unknown", text, "描述同时指向门架和层架，不能可靠决定当前位置。");
    }
    return zoneResult("door", text);
  }
  if (new Set(levels).size > 1) {
    return zoneResult("unknown", text, "描述跨越多个层架，不能可靠决定当前位置。");
  }
  if (levels.length === 1) return zoneResult(levels[0], text);
  return zoneResult("unknown", text, "位置描述未命中允许的粗粒度分区。");
}

function normalizeInventory(inventory) {
  if (!Array.isArray(inventory)) throw Object.assign(new Error("缺少 inventory。"), { status: 400 });
  return inventory.slice(0, 24).map((item, index) => {
    const name = cleanText(item?.name, 40);
    if (!name) throw Object.assign(new Error(`inventory[${index}] 缺少 name。`), { status: 400 });
    return {
      name,
      category: cleanText(item?.category, 20),
      notes: cleanText(item?.notes),
      state: cleanText(item?.state),
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null,
    };
  });
}

function normalizeItemStates(itemStates) {
  if (itemStates === undefined) return new Map();
  if (!Array.isArray(itemStates)) throw Object.assign(new Error("itemStates 必须是数组。"), { status: 400 });
  return new Map(itemStates.slice(0, 24).map((item, index) => {
    const name = cleanText(item?.name, 40);
    const status = cleanText(item?.status, 30) || "no_reminder";
    if (!name) throw Object.assign(new Error(`itemStates[${index}] 缺少 name。`), { status: 400 });
    return [name, status];
  }));
}

function normalizeStorageConfirmations(confirmations) {
  if (confirmations === undefined) return new Map();
  if (!Array.isArray(confirmations)) {
    throw Object.assign(new Error("storageConfirmations 必须是数组。"), { status: 400 });
  }
  return new Map(confirmations.slice(0, 24).map((item, index) => {
    const name = cleanText(item?.name, 40);
    const confirmation = cleanText(item?.confirmation, 40) || "not_confirmed";
    if (!name) throw Object.assign(new Error(`storageConfirmations[${index}] 缺少 name。`), { status: 400 });
    if (!storageConfirmationValues.has(confirmation)) {
      throw Object.assign(new Error(`storageConfirmations[${index}] 的 confirmation 不受支持。`), { status: 400 });
    }
    return [name, confirmation];
  }));
}

function isEgg(item) {
  return /(鸡蛋|鸭蛋|鹅蛋|蛋盒|鲜蛋)/.test(item.name);
}

function isRawProteinCandidate(item) {
  return /(生肉|鸡胸|鸡腿|猪肉|牛肉|羊肉|肉排|鱼|虾|蟹|海鲜)/.test(item.name);
}

function isProduce(item) {
  return item.category === "蔬菜" || /(生菜|白菜|青菜|菠菜|西兰花|胡萝卜|黄瓜|番茄|水果|苹果|橙子|葡萄)/.test(item.name);
}

function suggestion({ item, type, currentZone, suggestedZone = null, title, reason, prerequisite = "", sourceRule, priority }) {
  return {
    item: item.name,
    type,
    currentZone,
    currentZoneLabel: zoneDefinitions[currentZone]?.label || zoneDefinitions.unknown.label,
    suggestedZone,
    suggestedZoneLabel: suggestedZone ? zoneDefinitions[suggestedZone]?.label || suggestedZone : null,
    title,
    reason,
    prerequisite,
    requiresUserConfirmation: type === "confirm_first",
    sourceRule,
    priority,
  };
}

function buildLayout(zones) {
  const groups = new Map(layoutZoneOrder.map((zone) => [zone, []]));
  zones.forEach((item) => {
    if (!groups.has(item.approximateZone)) return;
    groups.get(item.approximateZone).push({ name: item.name, position: "current", moved: false });
  });
  return groups;
}

function serializeLayout(groups) {
  return layoutZoneOrder
    .filter((zone) => groups.get(zone)?.length)
    .map((zone) => ({
      zone,
      zoneLabel: zoneDefinitions[zone].label,
      items: groups.get(zone),
    }));
}

function buildLayoutPreview(zones, suggestions) {
  const beforeGroups = buildLayout(zones);
  const afterGroups = new Map(layoutZoneOrder.map((zone) => [
    zone,
    (beforeGroups.get(zone) || []).map((item) => ({ ...item })),
  ]));
  let appliedSuggestionCount = 0;

  suggestions.forEach((item) => {
    if (item.type === "confirm_first" || !item.suggestedZone || !afterGroups.has(item.suggestedZone)) return;
    const currentItems = afterGroups.get(item.currentZone) || [];
    const currentIndex = currentItems.findIndex((candidate) => candidate.name === item.item);
    if (currentIndex < 0) return;
    const [currentItem] = currentItems.splice(currentIndex, 1);

    if (item.type === "same_zone_front") {
      currentItem.position = "front";
      currentItem.moved = true;
      currentItems.unshift(currentItem);
      appliedSuggestionCount += 1;
      return;
    }

    if (item.type === "move_zone") {
      currentItem.position = "front";
      currentItem.moved = true;
      afterGroups.get(item.suggestedZone).unshift(currentItem);
      appliedSuggestionCount += 1;
    }
  });

  return {
    before: serializeLayout(beforeGroups),
    after: serializeLayout(afterGroups),
    appliedSuggestionCount,
    pendingConfirmationCount: suggestions.filter((item) => item.type === "confirm_first").length,
    disclaimer: "建议后布局只预览已满足前提的规则，不代表用户已完成整理或食材安全状态发生变化。",
  };
}

export function buildFridgeOrganization({ inventory, itemStates, storageConfirmations } = {}) {
  const normalizedInventory = normalizeInventory(inventory);
  const stateByName = normalizeItemStates(itemStates);
  const confirmationByName = normalizeStorageConfirmations(storageConfirmations);
  const zones = normalizedInventory.map((item) => ({
    name: item.name,
    notes: item.notes,
    ...normalizeApproximateZone(item.notes),
  }));
  const zoneByName = new Map(zones.map((item) => [item.name, item]));
  const observedZones = new Set(zones.map((item) => item.approximateZone).filter((zone) => zone !== "unknown"));
  const candidates = [];

  for (const item of normalizedInventory) {
    const zone = zoneByName.get(item.name)?.approximateZone || "unknown";
    if (zone === "unknown") continue;
    const confirmation = confirmationByName.get(item.name) || "not_confirmed";
    let hasCrossZoneCandidate = false;

    if (isEgg(item) && zone === "door") {
      hasCrossZoneCandidate = true;
      if (confirmation === "original_carton" && observedZones.has("middle")) {
        candidates.push(suggestion({
          item,
          type: "move_zone",
          currentZone: zone,
          suggestedZone: "middle",
          title: `${item.name}从门架移到中层主空间`,
          reason: "你已确认仍使用原蛋盒；主空间比门架更少受到开门温度波动影响。",
          prerequisite: "仍使用原蛋盒保存。",
          sourceRule: "egg_original_carton_main_compartment",
          priority: 120,
        }));
      } else {
        candidates.push(suggestion({
          item,
          type: "confirm_first",
          currentZone: zone,
          suggestedZone: observedZones.has("middle") ? "middle" : null,
          title: `先确认${item.name}是否仍在原蛋盒`,
          reason: "确认包装条件后，才能决定是否从门架移到冰箱主空间。",
          prerequisite: "确认仍使用原蛋盒；未确认前不移动。",
          sourceRule: "egg_storage_confirmation_required",
          priority: 68,
        }));
      }
    }

    if (!hasCrossZoneCandidate && isRawProteinCandidate(item) && ["top", "middle"].includes(zone)) {
      hasCrossZoneCandidate = true;
      if (confirmation === "raw_sealed_leakproof" && observedZones.has("bottom")) {
        candidates.push(suggestion({
          item,
          type: "move_zone",
          currentZone: zone,
          suggestedZone: "bottom",
          title: `${item.name}移到下层`,
          reason: "你已确认这是生鲜肉/鱼且包装密封防漏；移到下层可降低汁液滴落到其他食材的风险。",
          prerequisite: "确认属于生鲜肉/鱼，且容器或包装密封防漏。",
          sourceRule: "raw_protein_sealed_lower_shelf",
          priority: 115,
        }));
      } else {
        candidates.push(suggestion({
          item,
          type: "confirm_first",
          currentZone: zone,
          suggestedZone: observedZones.has("bottom") ? "bottom" : null,
          title: `先确认${item.name}是否为生鲜且密封防漏`,
          reason: "只有确认食材类型和防漏包装后，才建议跨层移动。",
          prerequisite: "确认属于生鲜肉/鱼并密封防漏；未确认前不移动。",
          sourceRule: "raw_protein_storage_confirmation_required",
          priority: 64,
        }));
      }
    }

    if (!hasCrossZoneCandidate && isProduce(item) && confirmation === "uncut_produce" && zone !== "crisper" && observedZones.has("crisper")) {
      hasCrossZoneCandidate = true;
      candidates.push(suggestion({
        item,
        type: "move_zone",
        currentZone: zone,
        suggestedZone: "crisper",
        title: `${item.name}移到果蔬抽屉`,
        reason: "你已确认这是未切开的果蔬，且画面中识别到果蔬抽屉。",
        prerequisite: "确认是未切开的果蔬。",
        sourceRule: "confirmed_uncut_produce_crisper",
        priority: 95,
      }));
    }

    const urgency = stateByName.get(item.name) || "no_reminder";
    if (!hasCrossZoneCandidate && urgencyStatuses.has(urgency) && !/(前方|靠前|前侧)/.test(item.notes)) {
      candidates.push(suggestion({
        item,
        type: "same_zone_front",
        currentZone: zone,
        suggestedZone: zone,
        title: `${item.name}放到${zoneDefinitions[zone].label}前侧`,
        reason: "这是你主动标记要优先处理的食材；只在原分区内前移，减少被遮挡和遗忘。",
        prerequisite: "保持原冷藏/冷冻分区不变。",
        sourceRule: "confirmed_priority_same_zone_front",
        priority: 82,
      }));
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || a.item.localeCompare(b.item, "zh-CN"));
  const suggestions = candidates.slice(0, 3).map(({ priority, ...item }) => item);
  const unknownItems = zones.filter((item) => item.approximateZone === "unknown").map((item) => item.name);
  const layoutPreview = buildLayoutPreview(zones, suggestions);

  return {
    version: "coarse-zone-v1",
    zones,
    suggestions,
    layoutPreview,
    summary: suggestions.length
      ? `基于可复核的粗分区，给出 ${suggestions.length} 条整理建议。`
      : "当前没有足够可靠且满足确认条件的移动建议。",
    warnings: [
      "分区只来自门架、层架、抽屉和冷冻区等粗粒度位置描述，不代表精确坐标。",
      "整理建议不判断过期、新鲜度或是否可以安全食用；跨分区移动必须满足用户确认条件。",
    ],
    evidence: {
      strategy: "deterministic_coarse_zone_rules",
      observedZones: [...observedZones],
      normalizedItems: zones.length,
      unknownItems,
      candidateCount: candidates.length,
      returnedSuggestionCount: suggestions.length,
      maxSuggestions: 3,
      sourceRefs: [
        "FDA_ARE_YOU_STORING_FOOD_SAFELY",
        "USDA_REFRIGERATION_AND_FOOD_SAFETY",
        "FOODSAFETY_GOV_FOUR_STEPS",
      ],
    },
  };
}
