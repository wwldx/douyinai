const FOOD_MARKERS = /(酸奶|乳酸菌|牛奶|奶酪|鸡蛋|鸭蛋|肉|鱼|虾|蟹|菜|瓜|果|豆|米|面|粉|饺子|馄饨|包子|馒头|汤圆|饮料|果汁|酱|油|盐|醋|糖|调味|火腿|香肠|培根|豆腐|蘑菇|菌菇|玉米|土豆|红薯)/;
const NON_FOOD_MARKERS = /(锅具|餐具|厨具|炊具|炒锅|汤锅|平底锅|电饭锅|空气炸锅|保温水瓶|保温瓶|保温杯|水瓶|水杯|杯子|刀具|砧板|筷子|勺子)/;
const GENERIC_PACKAGE = /^(?:白色|黑色|透明|红色|绿色|蓝色)?(?:袋装|盒装|瓶装|罐装|包装)(?:食材|食品|物品|内容物)?$/;
const GENERIC_CONTAINER = /^(?:保鲜盒|饭盒|袋子|包装盒)(?:内)?(?:食物|食材|内容物)?$/;
const VAGUE_NAME_MARKERS = /(疑似|可能|大概|看似|或|类食材|包装食品|包装食物|内容不明|种类不明|具体不明|无法确认)/;
const VAGUE_EVIDENCE_MARKERS = /(需确认内容|需要确认内容|无法确认内容|看不清内容|无法判断内容|内容不明|种类不明|具体不明)/;

function clean(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

export function classifyFridgeItemName(value) {
  const name = clean(value);
  if (!name) return "unknown";
  if (NON_FOOD_MARKERS.test(name) && !FOOD_MARKERS.test(name)) return "non_food";
  if (/^(碗|盘|锅|瓶|杯|容器|餐盒)$/.test(name)) return "non_food";
  if (/^(不明|未知|看不清|无法确认)/.test(name)) return "uncertain";
  if (VAGUE_NAME_MARKERS.test(name)) return "uncertain";
  if ((GENERIC_PACKAGE.test(name) || GENERIC_CONTAINER.test(name)) && !FOOD_MARKERS.test(name)) return "uncertain";
  return "food";
}

export function classifyFridgeItem(item) {
  const classification = classifyFridgeItemName(item?.name);
  if (classification !== "food") return classification;
  const evidence = clean(`${item?.state || ""} ${item?.notes || ""}`);
  return VAGUE_EVIDENCE_MARKERS.test(evidence) ? "uncertain" : "food";
}

function uniqueBy(list, keyOf) {
  const seen = new Set();
  return list.filter((item) => {
    const key = clean(keyOf(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeFridgeVision(vision = {}) {
  const keptItems = [];
  const movedToUncertain = [];
  const filteredNonFood = [];

  for (const item of Array.isArray(vision.items) ? vision.items : []) {
    const classification = classifyFridgeItem(item);
    if (classification === "food") {
      keptItems.push(item);
    } else if (classification === "uncertain") {
      const originalEvidence = [item?.state, item?.notes]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join("；");
      movedToUncertain.push({
        description: String(item?.name || "不明包装").trim(),
        reason: [
          "当前只能确认大类、包装或容器，无法确定具体食材，暂不参与晚餐规划。",
          originalEvidence ? `原识别位置/状态：${originalEvidence}` : "",
        ].filter(Boolean).join(" "),
      });
    } else if (classification === "non_food") {
      filteredNonFood.push(String(item?.name || "").trim());
    }
  }

  const uncertainItems = uniqueBy(
    [...(Array.isArray(vision.uncertainItems) ? vision.uncertainItems : []), ...movedToUncertain],
    (item) => item?.description,
  ).slice(0, 8);
  const warnings = [...(Array.isArray(vision.warnings) ? vision.warnings : [])];
  if (filteredNonFood.length || movedToUncertain.length) {
    warnings.push("已排除非食材物品；看不清内容的包装不会参与规划，需要补拍或人工确认。");
  }

  const rawSceneKind = String(vision?.sceneAssessment?.kind || vision?.scene || "").trim();
  const sceneKind = ["fridge", "not_fridge", "unusable"].includes(rawSceneKind)
    ? rawSceneKind
    : keptItems.length > 0
      ? "fridge"
      : "unknown";
  const sceneReason = String(vision?.sceneAssessment?.reason || "").trim()
    || (sceneKind === "fridge"
      ? "兼容旧识别结果：存在可确认食材。"
      : "旧识别结果缺少画面类型，不能据此确认空库存。");

  return {
    vision: {
      ...vision,
      sceneAssessment: { kind: sceneKind, reason: sceneReason },
      items: sceneKind === "fridge" ? uniqueBy(keptItems, (item) => item?.name).slice(0, 16) : [],
      uncertainItems,
      warnings: [...new Set(warnings.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 5),
    },
    diagnostics: {
      filteredNonFood,
      movedToUncertain: movedToUncertain.map((item) => item.description),
    },
  };
}
