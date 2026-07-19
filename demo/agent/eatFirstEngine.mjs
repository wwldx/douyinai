const statusRules = {
  no_reminder: {
    score: 0,
    group: "noReminder",
    label: "暂不提醒",
    reason: "用户没有提供需要优先处理的状态。",
  },
  recently_bought: {
    score: 5,
    group: "noReminder",
    label: "刚买",
    reason: "用户确认是刚买的，当前不提高先吃优先级。",
  },
  opened: {
    score: 70,
    group: "soonPriority",
    label: "已开封",
    reason: "用户确认已经开封，建议优先纳入近两餐；食用前仍需检查标签和存放条件。",
  },
  label_soon: {
    score: 100,
    group: "tonightPriority",
    label: "确认标签日期临近",
    reason: "用户明确确认标签日期临近，今晚规划优先考虑；这不等于系统判断仍可安全食用。",
  },
  opened_label_soon: {
    score: 110,
    group: "tonightPriority",
    label: "已开封且确认标签日期临近",
    reason: "用户同时确认已开封和标签日期临近，今晚优先考虑；使用前仍需自行确认食材状态。",
  },
  unknown: {
    score: 0,
    group: "needsConfirmation",
    label: "状态不确定",
    reason: "状态不确定时只提醒继续确认，不进入先吃排序。",
  },
};

function cleanName(value) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, 40);
}

function normalizeItemStates(itemStates) {
  if (!Array.isArray(itemStates)) throw Object.assign(new Error("缺少 itemStates。"), { status: 400 });

  return itemStates.slice(0, 20).map((item, index) => {
    const name = cleanName(item?.name);
    const status = String(item?.status || "no_reminder").trim();
    if (!name) throw Object.assign(new Error(`itemStates[${index}] 缺少 name。`), { status: 400 });
    if (!statusRules[status]) throw Object.assign(new Error(`itemStates[${index}] 的 status 不受支持。`), { status: 400 });
    return { name, status, inputOrder: index };
  });
}

function toResultItem(item) {
  const rule = statusRules[item.status];
  return {
    name: item.name,
    confirmedStatus: item.status,
    statusLabel: rule.label,
    priorityScore: rule.score,
    reason: rule.reason,
  };
}

export function buildEatFirstList({ itemStates } = {}) {
  const normalized = normalizeItemStates(itemStates);
  const groups = {
    tonightPriority: [],
    soonPriority: [],
    needsConfirmation: [],
    noReminder: [],
  };

  normalized.forEach((item) => {
    groups[statusRules[item.status].group].push({ ...toResultItem(item), inputOrder: item.inputOrder });
  });

  Object.values(groups).forEach((items) => {
    items.sort((a, b) => b.priorityScore - a.priorityScore || a.inputOrder - b.inputOrder);
    items.forEach((item) => delete item.inputOrder);
  });

  const plannerPriorities = [...groups.tonightPriority, ...groups.soonPriority]
    .slice(0, 5)
    .map((item) => item.name);
  const summary = groups.tonightPriority.length
    ? `按你确认的信息，这一餐优先考虑 ${groups.tonightPriority.map((item) => item.name).join("、")}。`
    : groups.soonPriority.length
      ? `按你确认的信息，近两餐优先考虑 ${groups.soonPriority.map((item) => item.name).join("、")}。`
      : groups.needsConfirmation.length
        ? `有 ${groups.needsConfirmation.length} 样食材状态不确定，先确认后再决定是否使用。`
        : "当前没有需要提高优先级的食材。";

  return {
    version: "confirmed-status-v1",
    summary,
    plannerPriorities,
    ...groups,
    warnings: [
      "优先级只使用用户主动确认的状态，不从照片、颜色或包装外观推断日期。",
      "先吃建议不代表食材未过期或可以安全食用，使用前仍需确认标签、存放和实际状态。",
    ],
    evidence: {
      strategy: "deterministic_confirmed_status",
      comparedItems: normalized.length,
      statusCounts: normalized.reduce((counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        return counts;
      }, {}),
    },
  };
}
