import { useCallback, useMemo, useRef, useState } from "react";
import Toast from "./components/Toast";
import { fallbackUploadPlan, normalizePlan, normalizeVision, samples } from "./data/samples";

const modeCards = [
  {
    id: "busy",
    title: "时间忙",
    subtitle: "25 分钟内，少洗锅",
    time: "25 分钟",
    energy: "中",
    cookingLevel: "新手",
    preferences: ["快手", "少洗锅", "热乎"],
    avoid: ["复杂刀工", "油炸", "长时间炖煮"],
    goal: "想尽快吃上热饭，不想增加额外负担",
  },
  {
    id: "explore",
    title: "想尝试新菜",
    subtitle: "可以多花一点时间",
    time: "40 分钟",
    energy: "中高",
    cookingLevel: "入门",
    preferences: ["愿意练习", "口味完整", "可小幅补买"],
    avoid: ["高失败率", "重油烟"],
    goal: "想在可控难度里尝试一道更有成就感的菜",
  },
  {
    id: "tired",
    title: "今天很累",
    subtitle: "低负担，能吃饱",
    time: "15 分钟",
    energy: "低",
    cookingLevel: "新手",
    preferences: ["省事", "抗饿", "少油烟"],
    avoid: ["多锅并行", "复杂备菜", "重口夜宵"],
    goal: "只想吃一顿稳定热食，不想硬撑复杂做饭",
  },
];

const mealSlots = [
  { id: "breakfast", label: "早餐" },
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
  { id: "late", label: "夜宵" },
];

const fallbackTargetPlan = {
  targetDish: {
    name: "想吃的菜",
    intentTime: "tonight",
    coreTaste: "按你想吃的口味来",
    estimatedTime: "30-45 分钟",
    difficulty: "中等",
  },
  verdict: {
    title: "先看看家里够不够做",
    summary: "我会先尊重你想吃的菜，再看冰箱里现有材料够不够、今晚做起来麻不麻烦。",
    primaryAction: "cook_simplified",
  },
  inventoryMatch: {
    availableItems: [],
    missingCritical: ["关键主料"],
    missingOptional: ["常用调味料"],
    substitutions: [],
  },
  executionPlan: {
    recommendedVersion: "先确认主料够不够，缺主料时不要硬凑成另一道菜。",
    steps: ["确认这道菜最重要的主料。", "核对冰箱里已有材料。", "缺主料时先补买，或者改成相近口味的热食。", "按你确认的时间控制步骤复杂度。"],
    difficultyWarnings: ["当前是保守兜底方案，关键材料还需要你确认。"],
    prepForTomorrow: "如果今天材料不齐，可以把主料加入明天补买清单。",
  },
  userFit: {
    skillNote: "对新手来说，完整版偏难。",
    timeNote: "当前时间更适合简化热食。",
    profileNotes: [],
  },
  commerceCards: [
    {
      type: "douyin_mall",
      title: "顺手补点材料",
      item: "关键主料",
      reason: "少了主料，这道菜做出来味道会差很多。",
      cta: "模拟去看看",
    },
  ],
  talkTrack: "",
};

function inferMealSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 22) return "dinner";
  return "late";
}

function mapIntentTime(mealSlot) {
  if (mealSlot === "late" || mealSlot === "dinner") return "tonight";
  if (mealSlot === "breakfast") return "today";
  return "today";
}

async function postJson(url, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 60000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || `请求失败：${response.status}`);
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function compressImage(file, maxSide = 1400, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("图片读取失败")));
    reader.addEventListener("load", () => {
      const img = new Image();
      img.addEventListener("error", () => reject(new Error("图片解析失败")));
      img.addEventListener("load", () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      });
      img.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}

function normalizeTargetPlan(plan) {
  return {
    ...fallbackTargetPlan,
    ...plan,
    targetDish: { ...fallbackTargetPlan.targetDish, ...plan?.targetDish },
    verdict: { ...fallbackTargetPlan.verdict, ...plan?.verdict },
    inventoryMatch: { ...fallbackTargetPlan.inventoryMatch, ...plan?.inventoryMatch },
    executionPlan: { ...fallbackTargetPlan.executionPlan, ...plan?.executionPlan },
    userFit: { ...fallbackTargetPlan.userFit, ...plan?.userFit },
    commerceCards: Array.isArray(plan?.commerceCards) ? plan.commerceCards : fallbackTargetPlan.commerceCards,
  };
}

function namesOf(items, limit = 5) {
  return items
    .map((item) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean)
    .slice(0, limit);
}

const ingredientIconAliases = [
  ["番茄酱", "番茄酱"],
  ["西红柿", "番茄"],
  ["番茄", "番茄"],
  ["鸡蛋", "鸡蛋"],
  ["鸡胸", "鸡胸肉"],
  ["鸡腿", "鸡胸肉"],
  ["鸡肉", "鸡胸肉"],
  ["猪肉", "猪肉"],
  ["五花肉", "猪肉"],
  ["牛肉", "牛肉"],
  ["牛腩", "牛肉"],
  ["鱼", "鱼"],
  ["虾", "虾"],
  ["豆腐", "豆腐"],
  ["黄瓜", "黄瓜"],
  ["胡萝卜", "胡萝卜"],
  ["土豆", "土豆"],
  ["马铃薯", "土豆"],
  ["蘑菇", "蘑菇"],
  ["香菇", "蘑菇"],
  ["菌菇", "蘑菇"],
  ["菠菜", "菠菜"],
  ["生菜", "菠菜"],
  ["青菜", "菠菜"],
  ["绿叶菜", "菠菜"],
  ["西兰花", "西兰花"],
  ["花菜", "西兰花"],
  ["菜花", "西兰花"],
  ["圆白菜", "菠菜"],
  ["包菜", "菠菜"],
  ["卷心菜", "菠菜"],
  ["洋葱", "洋葱"],
  ["大蒜", "大蒜"],
  ["蒜", "大蒜"],
  ["辣椒", "辣椒"],
  ["青椒", "辣椒"],
  ["面条", "面条"],
  ["挂面", "面条"],
  ["意面", "意面"],
  ["米饭", "米饭"],
  ["剩饭", "米饭"],
  ["面包", "面包"],
  ["饺子", "饺子"],
  ["速冻饺子", "饺子"],
  ["牛奶", "牛奶"],
  ["酸奶", "酸奶"],
  ["奶酪", "奶酪"],
  ["黄油", "黄油"],
  ["酱油", "酱油"],
  ["橄榄油", "橄榄油"],
  ["玉米", "玉米"],
  ["茄子", "茄子"],
  ["苹果", "苹果"],
  ["香蕉", "香蕉"],
  ["橙子", "橙子"],
  ["葡萄", "葡萄"],
  ["草莓", "草莓"],
  ["西瓜", "西瓜"],
  ["柠檬", "柠檬"],
  ["牛油果", "牛油果"],
  ["燕麦", "燕麦"],
];

function ingredientIconName(name) {
  const normalized = String(name || "").replace(/\s+/g, "");
  const matched = ingredientIconAliases.find(([keyword]) => normalized.includes(keyword) || keyword.includes(normalized));
  return matched?.[1] || "";
}

function ingredientIconUrl(name) {
  const iconName = ingredientIconName(name);
  if (!iconName) return "";
  return `/sliced/${encodeURIComponent(iconName)}.png`;
}

function modeSample(modeId) {
  const sampleId = modeId === "explore" ? "practice" : modeId === "tired" ? "late" : "quick";
  return samples.find((sample) => sample.id === sampleId) || samples[0];
}

function formatMealSlot(slot) {
  return mealSlots.find((item) => item.id === slot)?.label || "晚餐";
}

function mealSlotHint(slot) {
  const label = formatMealSlot(slot);
  return `已按当前时间预选为${label}，可以手动改。`;
}

function extractDishName(text) {
  return String(text || "")
    .replace(/我(今天|今晚|明天|这周|早餐|午餐|晚餐|夜宵)?(想吃|想做|要做|想复刻|复刻|想来一份)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 18) || "目标菜";
}

function inferDishNameFromFileName(fileName) {
  const baseName = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\u4e00-\u9fff]/.test(baseName)) return "";
  if (baseName.length > 18) return "";
  return cleanDishName(baseName);
}

function cleanDishName(name) {
  const cleaned = String(name || "")
    .replace(/^(疑似|可能是|可能为|大概率是|待确认目标菜[:：]?)/, "")
    .replace(/[，。！？,.!?；;].*$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleaned) return "";
  if (/^(模型结果|目标菜|目标菜待确认|待确认|未知|未知菜品|无法确定|不确定|菜品|食物|图片|照片)$/i.test(cleaned)) return "";
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 18);
}

function dishKnowledge(dishName) {
  if (/黄焖鸡/.test(dishName)) {
    return {
      name: "黄焖鸡",
      coreTaste: "咸香微甜、热乎下饭",
      estimatedTime: "35-45 分钟",
      difficulty: "中等",
      required: ["鸡腿肉", "土豆", "香菇", "青椒"],
      optional: ["姜", "蒜", "米饭"],
      steps: ["鸡腿肉切块后焯水或煎到变色。", "土豆和香菇下锅翻炒，加入酱油和少量糖。", "加水焖到鸡肉熟透、土豆变软。", "最后放青椒收汁，配米饭最稳。"],
      warning: "黄焖鸡的关键是鸡肉熟透和焖煮时间；如果没有鸡肉，不建议硬说成完整黄焖鸡。",
    };
  }

  if (/回锅肉/.test(dishName)) {
    return {
      name: "回锅肉",
      coreTaste: "咸香微辣、下饭",
      estimatedTime: "35-45 分钟",
      difficulty: "中等偏难",
      required: ["五花肉", "青椒", "蒜苗", "豆瓣酱"],
      optional: ["姜", "蒜", "洋葱"],
      steps: ["五花肉先煮到断生，放凉后切薄片。", "少油煸出肉片油脂。", "加入豆瓣酱炒出红油。", "放青椒或蒜苗快速翻炒，最后简单调味。"],
      warning: "回锅肉需要先煮再炒，对刀工和火候有一点要求；如果没有五花肉，可以先补买，不要用鸡蛋硬替代成回锅肉。",
    };
  }

  if (/番茄.*牛腩|牛腩/.test(dishName)) {
    return {
      name: "番茄牛腩",
      coreTaste: "酸甜、热乎、下饭",
      estimatedTime: "60 分钟以上",
      difficulty: "偏难",
      required: ["牛腩", "番茄", "土豆"],
      optional: ["洋葱", "八角", "香叶"],
      steps: ["牛腩焯水去浮沫。", "番茄炒出汤底。", "加入牛腩和热水炖煮。", "最后加入土豆炖软并调味。"],
      warning: "番茄牛腩需要较长炖煮时间，时间不足时更适合拆成番茄汤面或明天再做完整版。",
    };
  }

  return {
    name: dishName || "想吃的菜",
    coreTaste: "按你想吃的口味来",
    estimatedTime: "30-45 分钟",
    difficulty: "中等",
    required: [dishName || "这道菜的主料"],
    optional: ["常用调味料"],
    steps: ["先确认这道菜最重要的主料够不够。", "把已有食材按相近口味处理。", "缺主料时先补买，不要硬凑成另一道菜。", "用少油、少步骤版本完成这一餐。"],
    warning: "当前只能按你想吃的方向给出保守路线，主料不够时需要你确认或补买。",
  };
}

function ingredientMatches(ingredient, inventoryNames) {
  const aliases = {
    鸡腿肉: ["鸡腿肉", "鸡肉", "鸡胸肉", "鸡腿", "鸡翅"],
    鸡肉: ["鸡肉", "鸡腿肉", "鸡胸肉", "鸡腿"],
    五花肉: ["五花肉", "猪肉", "肉片"],
    牛腩: ["牛腩", "牛肉"],
    青椒: ["青椒", "彩椒", "甜椒", "辣椒"],
    蒜苗: ["蒜苗", "青蒜", "大蒜"],
    豆瓣酱: ["豆瓣酱", "辣酱"],
    香菇: ["香菇", "蘑菇", "菌菇"],
    土豆: ["土豆", "马铃薯"],
    番茄: ["番茄", "西红柿"],
    米饭: ["米饭", "剩饭"],
  };
  const candidates = aliases[ingredient] || [ingredient];
  return inventoryNames.find((name) => candidates.some((candidate) => name.includes(candidate) || candidate.includes(name)));
}

function shoppingReasonText(card, dishName) {
  const item = String(card?.item || "").trim();
  const reason = String(card?.reason || "").trim();
  if (!item) return reason || "这些材料补上后，这顿饭会更接近你想吃的味道。";
  if (/关键缺口|复刻|核心缺口/.test(reason)) {
    return `做${dishName || "这道菜"}还差${item}，补上后味道会更接近你想吃的那一口。`;
  }
  return reason || `做${dishName || "这道菜"}还差${item}。`;
}

function userText(text) {
  return String(text || "")
    .replace(/目标菜/g, "这道菜")
    .replace(/关键缺口/g, "还差的材料")
    .replace(/核心缺口/g, "主要缺的材料")
    .replace(/补齐/g, "补上")
    .replace(/尽量复刻/g, "尽量做出那个味道")
    .replace(/复刻/g, "照着做");
}

function createTargetFallbackPlan({ text, imageAnalysis, inventory, mealSlot, availableTime }) {
  const inferredName = imageAnalysis?.dishName || extractDishName(text);
  const knowledge = dishKnowledge(inferredName);
  const inventoryNames = namesOf(inventory, 24);
  const availableItems = [];
  const missingCritical = [];

  knowledge.required.forEach((item) => {
    const matched = ingredientMatches(item, inventoryNames);
    if (matched) availableItems.push(matched);
    else missingCritical.push(item);
  });

  const title = missingCritical.length
    ? `想吃${knowledge.name}，家里还差几样`
    : `家里材料够，可以做一版${knowledge.name}`;

  return normalizeTargetPlan({
    targetDish: {
      name: knowledge.name,
      intentTime: mapIntentTime(mealSlot),
      coreTaste: imageAnalysis?.coreTaste || knowledge.coreTaste,
      estimatedTime: imageAnalysis?.estimatedTime || knowledge.estimatedTime,
      difficulty: imageAnalysis?.difficulty || knowledge.difficulty,
    },
    verdict: {
      title,
      summary: missingCritical.length
        ? `你想吃的是${knowledge.name}。现在家里还少 ${missingCritical.join("、")}；不补买的话，可以先做相近口味的简化热食，但就不能算完整的${knowledge.name}。`
        : `你想吃的是${knowledge.name}。家里主要材料够，可以按简化步骤做一版。`,
      primaryAction: missingCritical.length ? "shop_then_cook" : "cook_now",
    },
    inventoryMatch: {
      availableItems: availableItems.length ? availableItems : inventoryNames.slice(0, 4),
      missingCritical,
      missingOptional: knowledge.optional.filter((item) => !ingredientMatches(item, inventoryNames)),
      substitutions: [],
    },
    executionPlan: {
      recommendedVersion: missingCritical.length
        ? `先补 ${missingCritical.slice(0, 3).join("、")}，再做${knowledge.name}；如果不补买，就改成现有食材的相近口味热食。`
        : `用现有食材做一版${knowledge.name}，按 ${availableTime} 控制步骤。`,
      steps: knowledge.steps,
      difficultyWarnings: [knowledge.warning],
      prepForTomorrow: missingCritical.length ? `把 ${missingCritical.slice(0, 3).join("、")} 加入补买清单，明天照着做会更稳。` : "如果今天时间不够，可以把切配留到明天再做完整版。",
    },
    userFit: {
      skillNote: knowledge.difficulty.includes("难") ? "这道菜对新手略有挑战，建议用简化步骤。" : "这道菜可以按简化版执行。",
      timeNote: `当前确认的可支配时间是 ${availableTime}。`,
      profileNotes: ["已按用户确认的餐次和时间约束生成。"],
    },
    commerceCards: missingCritical.slice(0, 2).map((item) => ({
      type: "douyin_mall",
      title: "顺手补点材料",
      item,
      reason: `做${knowledge.name}少不了${item}，没有它味道会差一截。`,
      cta: "模拟去看看",
    })),
  });
}

export default function App() {
  const [step, setStep] = useState(1);
  const [modeId, setModeId] = useState("busy");
  const [mealSlot, setMealSlot] = useState(inferMealSlot());
  const [availableTime, setAvailableTime] = useState(modeCards[0].time);
  const [fridgeImage, setFridgeImage] = useState("");
  const [fridgeFileName, setFridgeFileName] = useState("");
  const [targetImage, setTargetImage] = useState("");
  const [targetImageFileName, setTargetImageFileName] = useState("");
  const [targetImageDishName, setTargetImageDishName] = useState("");
  const [targetImageAnalysis, setTargetImageAnalysis] = useState(null);
  const [targetImageStatus, setTargetImageStatus] = useState("");
  const [vision, setVision] = useState(null);
  const [confirmedNames, setConfirmedNames] = useState([]);
  const [intent, setIntent] = useState("recommend");
  const [targetText, setTargetText] = useState("");
  const [targetTextSource, setTargetTextSource] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const fridgeInputRef = useRef(null);
  const targetInputRef = useRef(null);

  const selectedMode = useMemo(() => modeCards.find((mode) => mode.id === modeId) || modeCards[0], [modeId]);
  const confirmedInventory = useMemo(() => {
    const currentVision = vision || normalizeVision(modeSample(modeId).vision);
    return currentVision.items.filter((item) => confirmedNames.includes(item.name));
  }, [confirmedNames, modeId, vision]);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 1800);
  }, []);

  function setMode(nextModeId) {
    const nextMode = modeCards.find((mode) => mode.id === nextModeId) || modeCards[0];
    setModeId(nextModeId);
    setAvailableTime(nextMode.time);
  }

  function buildUserContext() {
    return {
      user: {
        name: "展示用户",
        cookingLevel: selectedMode.cookingLevel,
        preferences: selectedMode.preferences,
        avoid: selectedMode.avoid,
        recentMeals: [],
        goal: `${formatMealSlot(mealSlot)}：${selectedMode.goal}`,
      },
      context: {
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        mealSlot: formatMealSlot(mealSlot),
        availableCookingTime: availableTime,
        energyLevel: selectedMode.energy,
        nextSchedule: "由用户确认",
      },
    };
  }

  async function handleFridgeFile(event) {
    const [file] = event.target.files;
    if (!file) return;
    try {
      setFridgeFileName(file.name);
      setFridgeImage(await compressImage(file));
    } catch (error) {
      setFridgeFileName("");
      showToast(error.message || "图片读取失败");
    }
  }

  async function handleTargetFile(event) {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const inferredDishName = inferDishNameFromFileName(file.name);
      const imageDataUrl = await compressImage(file);
      setTargetImageFileName(file.name);
      setTargetImage(imageDataUrl);
      setTargetImageDishName(inferredDishName);
      setTargetImageAnalysis(null);
      setTargetImageStatus("正在识别菜名，稍后可手动修改。");
      await analyzeTargetImage({
        imageDataUrl,
        fileName: file.name,
        fallbackDishName: inferredDishName,
        shouldOverwriteText: !targetText.trim() || targetTextSource !== "manual",
      });
    } catch (error) {
      setTargetImageFileName("");
      setTargetImageAnalysis(null);
      setTargetImageStatus("");
      showToast(error.message || "目标菜图片读取失败");
    }
  }

  async function analyzeFridge() {
    if (!fridgeImage) {
      showToast("先上传一张冰箱照片");
      return;
    }

    setLoading("正在识别冰箱里的可用食材");
    try {
      const data = await postJson("/api/analyze-fridge", { imageDataUrl: fridgeImage, sourceFileName: fridgeFileName });
      const normalized = normalizeVision(data.vision);
      setVision(normalized);
      setConfirmedNames(namesOf(normalized.items, 8));
      setStep(2);
    } catch (error) {
      const sampleVision = normalizeVision(modeSample(modeId).vision);
      setVision(sampleVision);
      setConfirmedNames(namesOf(sampleVision.items, 8));
      setStep(2);
      showToast("识别暂时不稳定，请确认下方食材");
    } finally {
      setLoading("");
    }
  }

  function toggleIngredient(name) {
    setConfirmedNames((current) => (
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    ));
  }

  async function analyzeTargetImage({
    imageDataUrl = targetImage,
    fileName = targetImageFileName,
    fallbackDishName = targetImageDishName,
    shouldOverwriteText = true,
  } = {}) {
    if (!imageDataUrl) return null;
    try {
      setLoading("正在识别你想吃的菜");
      const data = await postJson("/api/analyze-target-dish", { imageDataUrl, sourceFileName: fileName }, { timeoutMs: 25000 });
      const dishName = cleanDishName(data.targetVision?.dishName || data.targetVision?.name || "");
      if (dishName) {
        const text = `我${formatMealSlot(mealSlot)}想吃${dishName}`;
        if (shouldOverwriteText) setTargetText(text);
        if (shouldOverwriteText) setTargetTextSource("vision");
        const nextAnalysis = { ...data.targetVision, dishName };
        setTargetImageAnalysis(nextAnalysis);
        setTargetImageStatus(`识别为「${dishName}」，可以修改菜名或补充时间、口味要求。`);
        return nextAnalysis;
      }
      if (fallbackDishName) {
        showToast("菜图菜名不明确，已按文件名继续");
        const nextAnalysis = {
          ...(data.targetVision || {}),
          dishName: fallbackDishName,
          warnings: [...(data.targetVision?.warnings || []), "目标菜图片未识别出明确菜名，展示端使用文件名作为菜名兜底。"],
        };
        if (shouldOverwriteText) setTargetText(`我${formatMealSlot(mealSlot)}想吃${fallbackDishName}`);
        if (shouldOverwriteText) setTargetTextSource("fileName");
        setTargetImageAnalysis(nextAnalysis);
        setTargetImageStatus(`菜图不够明确，先按文件名「${fallbackDishName}」填入，可手动修改。`);
        return nextAnalysis;
      }
      showToast("菜图菜名不明确，请输入具体菜名");
      setTargetImageAnalysis(null);
      setTargetImageStatus("没有识别出明确菜名，请直接在文本框输入。");
      return null;
    } catch {
      if (!fallbackDishName) {
        showToast("菜图识别失败，请输入菜名后再试");
        setTargetImageAnalysis(null);
        setTargetImageStatus("菜图识别失败，请直接输入具体菜名。");
        return null;
      }
      showToast("菜图识别失败，已按文件名继续");
      const nextAnalysis = {
        dishName: fallbackDishName,
        warnings: ["目标菜图片识别失败，展示端使用文件名作为菜名兜底。"],
      };
      if (shouldOverwriteText) setTargetText(`我${formatMealSlot(mealSlot)}想吃${fallbackDishName}`);
      if (shouldOverwriteText) setTargetTextSource("fileName");
      setTargetImageAnalysis(nextAnalysis);
      setTargetImageStatus(`识别失败，先按文件名「${fallbackDishName}」填入，可手动修改。`);
      return nextAnalysis;
    } finally {
      setLoading("");
    }
  }

  async function createPlan() {
    const inventory = confirmedInventory.length ? confirmedInventory : normalizeVision(modeSample(modeId).vision).items;
    const userContext = buildUserContext();

    if (intent === "target") {
      let imageAnalysis = null;
      if (!targetText.trim() && !targetImage) {
        showToast("输入想吃的菜名，或上传刷到的菜图");
        return;
      }
      imageAnalysis = targetImageAnalysis;
      const explicitText = targetText.trim();
      const explicitDishName = cleanDishName(extractDishName(explicitText));
      const imageDishName = cleanDishName(imageAnalysis?.dishName);
      const text = explicitDishName
        ? explicitText
        : imageDishName
          ? `我${formatMealSlot(mealSlot)}想吃${imageDishName}`
          : "";
      if (!text) {
        setLoading("");
        showToast(targetImage ? "请先确认或修改识别出的菜名" : "请输入具体菜名，例如“番茄牛腩”");
        return;
      }

      setLoading("正在看家里够不够做");
      try {
        const data = await postJson("/api/plan-target-dish", {
          inventory,
          userContext,
          targetDish: {
            text,
            intentTime: mapIntentTime(mealSlot),
            imageAnalysis,
          },
        }, { timeoutMs: 15000 });
        setResult({ type: "target", plan: normalizeTargetPlan(data.targetPlan) });
      } catch {
        setResult({ type: "target", plan: createTargetFallbackPlan({ text, imageAnalysis, inventory, mealSlot, availableTime }) });
      } finally {
        setLoading("");
        setStep(3);
      }
      return;
    }

    setLoading("正在生成最适合这一餐的做法");
    try {
      const data = await postJson("/api/plan-dinner", { inventory, userContext });
      setResult({ type: "dinner", plan: normalizePlan(data.plan) });
    } catch {
      setResult({ type: "dinner", plan: normalizePlan(modeSample(modeId).plan || fallbackUploadPlan) });
    } finally {
      setLoading("");
      setStep(3);
    }
  }

  function resetAll() {
    setStep(1);
    setVision(null);
    setConfirmedNames([]);
    setIntent("recommend");
    setTargetText("");
    setTargetTextSource("");
    setTargetImage("");
    setTargetImageFileName("");
    setTargetImageDishName("");
    setTargetImageAnalysis(null);
    setTargetImageStatus("");
    setResult(null);
    setLoading("");
  }

  function replanFromInventory() {
    setResult(null);
    setLoading("");
    setStep(2);
  }

  const currentVision = vision || normalizeVision(modeSample(modeId).vision);
  const visibleIngredients = currentVision.items.slice(0, 8);

  return (
    <div className="showcase-shell">
      <header className="app-topbar">
        <div>
          <span className="brand-dot" />
          <strong>冰箱晚餐</strong>
        </div>
          <span className="topbar-note">一餐计划</span>
      </header>

      <main className="app-main">
        {step === 1 && (
          <section className="screen screen-upload" aria-label="上传冰箱照片">
            <p className="eyebrow">Step 1</p>
            <h1>先看冰箱，再决定这顿饭</h1>
            <p className="lead">拍一张冰箱，确认这一餐和可支配时间，后面只给最适合当前场景的方案。</p>

            <div className="mode-grid" aria-label="状态选择">
              {modeCards.map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-card ${modeId === mode.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setMode(mode.id)}
                >
                  <strong>{mode.title}</strong>
                  <span>{mode.subtitle}</span>
                </button>
              ))}
            </div>

            <div className="confirm-panel">
              <div>
                <div className="field-label">餐次</div>
                <div className="segmented">
                  {mealSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={mealSlot === slot.id ? "active" : ""}
                      onClick={() => setMealSlot(slot.id)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{mealSlotHint(mealSlot)}</p>
              </div>
              <div>
                <div className="field-label">你愿意花多久</div>
                <div className="segmented">
                  {["15 分钟", "25 分钟", "40 分钟"].map((time) => (
                    <button
                      key={time}
                      type="button"
                      className={availableTime === time ? "active" : ""}
                      onClick={() => setAvailableTime(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <input ref={fridgeInputRef} type="file" accept="image/*" onChange={handleFridgeFile} hidden />
            <button className={`upload-tile ${fridgeImage ? "has-image" : ""}`} type="button" onClick={() => fridgeInputRef.current?.click()}>
              {fridgeImage ? (
                <img src={fridgeImage} alt="冰箱照片预览" />
              ) : (
                <span>
                  <strong>上传冰箱照片</strong>
                  <small>拍照或选择相册图片</small>
                </span>
              )}
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="screen" aria-label="选择吃什么">
            <p className="eyebrow">Step 2</p>
            <h1>这顿饭想吃什么？</h1>
            <p className="lead">先简单确认可用食材，再选择“帮我决定”或“我有想吃的”。</p>

            <div className="ingredient-strip" aria-label="可用食材确认">
              {visibleIngredients.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={confirmedNames.includes(item.name) ? "ingredient active" : "ingredient"}
                  onClick={() => toggleIngredient(item.name)}
                >
                  {ingredientIconUrl(item.name) && (
                    <img
                      src={ingredientIconUrl(item.name)}
                      alt=""
                      aria-hidden="true"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>

            <div className="choice-grid">
              <button
                type="button"
                className={`choice ${intent === "recommend" ? "active" : ""}`}
                onClick={() => setIntent("recommend")}
              >
                <strong>帮我决定</strong>
                <span>根据冰箱和时间，直接给一顿最稳的</span>
              </button>
              <button
                type="button"
                className={`choice ${intent === "target" ? "active" : ""}`}
                onClick={() => setIntent("target")}
              >
                <strong>我有想吃的</strong>
                <span>刷到一道菜，看看家里够不够做</span>
              </button>
            </div>

            {intent === "target" && (
              <div className="target-panel">
                <textarea
                  value={targetText}
                  onChange={(event) => {
                    setTargetText(event.target.value);
                    setTargetTextSource("manual");
                  }}
                  placeholder="例如：我今晚想吃番茄牛腩，但只有 25 分钟"
                  rows={3}
                />
                <input ref={targetInputRef} type="file" accept="image/*" onChange={handleTargetFile} hidden />
                <button className="secondary-upload" type="button" onClick={() => targetInputRef.current?.click()}>
                  {targetImage ? "已上传菜图，点击更换" : "也可以上传刷到的菜图"}
                </button>
                {targetImageStatus && (
                  <div className="target-status">
                    <strong>菜名确认</strong>
                    <span>{targetImageStatus}</span>
                  </div>
                )}
                {targetImage && (
                  <button
                    className="ghost-action"
                    type="button"
                    onClick={() => analyzeTargetImage({ shouldOverwriteText: true })}
                    disabled={Boolean(loading)}
                  >
                    重新识别并填入菜名
                  </button>
                )}
                {targetImage && <img className="target-preview" src={targetImage} alt="目标菜图片预览" />}
              </div>
            )}
          </section>
        )}

        {step === 3 && result && (
          <section className="screen result-screen" aria-label="推荐方案">
            <ResultView
              result={result}
              modeId={modeId}
              mealSlot={mealSlot}
              onReplan={replanFromInventory}
              onRestart={resetAll}
              onAction={showToast}
            />
          </section>
        )}
      </main>

      <footer className="bottom-action">
        {step === 1 && (
          <button className="primary-action" type="button" onClick={analyzeFridge} disabled={!fridgeImage || Boolean(loading)}>
            {loading || "识别冰箱"}
          </button>
        )}
        {step === 2 && (
          <div className="footer-row">
            <button className="ghost-action" type="button" onClick={() => setStep(1)}>上一步</button>
            <button className="primary-action" type="button" onClick={createPlan} disabled={Boolean(loading)}>
              {loading || (intent === "target" ? "看看家里够不够做" : "生成这一餐")}
            </button>
          </div>
        )}
        {step === 3 && (
          <button className="primary-action" type="button" onClick={replanFromInventory}>重新规划</button>
        )}
      </footer>

      {loading && (
        <div className="loading-mask">
          <span className="spinner" />
          <p>{loading}</p>
        </div>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

function ResultView({ result, modeId, mealSlot, onReplan, onRestart, onAction }) {
  if (result.type === "target") {
    const plan = result.plan;
    const available = namesOf(plan.inventoryMatch.availableItems, 6);
    const missing = namesOf(plan.inventoryMatch.missingCritical, 6);
    const commerce = Array.isArray(plan.commerceCards) ? plan.commerceCards.slice(0, 2) : [];

    return (
      <>
        <p className="eyebrow">Step 3</p>
        <h1>{plan.targetDish.name}</h1>
        <p className="lead">{userText(plan.verdict.summary)}</p>

        <section className="result-hero">
          <span>{formatMealSlot(mealSlot)}路线</span>
          <strong>{userText(plan.executionPlan.recommendedVersion)}</strong>
        </section>

        <section className="compact-section">
          <h2>今晚怎么做</h2>
          <ol className="clean-steps">
            {plan.executionPlan.steps.slice(0, 4).map((step, index) => (
              <li key={index}>{userText(step)}</li>
            ))}
          </ol>
        </section>

        <section className="two-column">
          <div>
            <h2>已有</h2>
            <div className="pill-list">{available.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
          <div>
            <h2>还差</h2>
            <div className="pill-list warn">
              {missing.length ? missing.map((item) => <span key={item}>{item}</span>) : <span>主要材料够了</span>}
            </div>
          </div>
        </section>

        {plan.executionPlan.difficultyWarnings?.length > 0 && (
          <section className="quiet-note">
            <strong>难点提醒</strong>
            <p>{userText(plan.executionPlan.difficultyWarnings[0])}</p>
          </section>
        )}

        {missing.length > 0 && (
          <section className="compact-section">
            <h2>顺手补点材料</h2>
            {commerce.length > 0
              ? commerce.map((card, index) => (
                  <div className="shopping-line" key={`${card.item}-${index}`}>
                    <strong>{card.item}</strong>
                    <span>{shoppingReasonText(card, plan.targetDish.name)}</span>
                  </div>
                ))
              : (
                  <div className="shopping-line">
                    <strong>{missing.join("、")}</strong>
                    <span>家里现在少这几样，补上后更接近你想吃的那道菜。这里先展示购物入口，不做真实下单。</span>
                  </div>
                )}
            <button className="ecosystem-action" type="button" onClick={() => onAction("已加入模拟购物车")}>
              放进模拟购物车，去抖音商城看看
            </button>
          </section>
        )}

        <LifeLogCard onAction={onAction} />

        <ResultActions onReplan={onReplan} onRestart={onRestart} />
      </>
    );
  }

  const plan = result.plan;
  const needed = namesOf(plan.baseMeal.requiredItems, 6);
  const shouldShowFallback = modeId === "tired" && plan.fallback?.type !== "delivery" && plan.fallback?.suggestion;

  return (
    <>
      <p className="eyebrow">Step 3</p>
      <h1>{plan.baseMeal.name}</h1>
      <p className="lead">{plan.summary || plan.baseMeal.why}</p>

      <section className="result-hero">
        <span>{plan.baseMeal.timeCost || "约 25 分钟"} · {plan.baseMeal.difficulty || "新手可做"}</span>
        <strong>{plan.baseMeal.why}</strong>
      </section>

      <section className="compact-section">
        <h2>现在就做</h2>
        <ol className="clean-steps">
          {plan.baseMeal.steps.slice(0, 4).map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="compact-section">
        <h2>会用到</h2>
        <div className="pill-list">{needed.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      {plan.shoppingUpgrade?.neededItems?.filter((item) => item !== "无").length > 0 && (
        <section className="quiet-note">
          <strong>可选补买</strong>
          <p>{plan.shoppingUpgrade.neededItems.filter((item) => item !== "无").join("、")}。{plan.shoppingUpgrade.reason}</p>
          <button className="ecosystem-action secondary" type="button" onClick={() => onAction("已加入模拟购物车")}>
            放进模拟购物车，去抖音商城看看
          </button>
        </section>
      )}

      {shouldShowFallback && (
        <section className="quiet-note">
          <strong>低负担备选</strong>
          <p>{plan.fallback.suggestion}</p>
        </section>
      )}

      <LifeLogCard onAction={onAction} />

      <ResultActions onReplan={onReplan} onRestart={onRestart} />
    </>
  );
}

function ResultActions({ onReplan, onRestart }) {
  return (
    <div className="result-actions">
      <button className="secondary-action" type="button" onClick={onReplan}>重新规划这一餐</button>
      <button className="text-link" type="button" onClick={onRestart}>换一张冰箱重新看</button>
    </div>
  );
}

function LifeLogCard({ onAction }) {
  return (
    <section className="life-log-card">
      <div>
        <h2>饭后记录</h2>
        <p>做好后拍一下成品，生成标题、封面文案和生活记录草稿。</p>
      </div>
      <button type="button" onClick={() => onAction("已生成生活记录草稿入口")}>
        拍成品，生成抖音生活记录
      </button>
    </section>
  );
}
