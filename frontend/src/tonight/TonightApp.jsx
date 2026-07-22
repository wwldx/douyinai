import { useCallback, useEffect, useRef, useState } from "react";
import { api, compressImage, fetchAssetFile } from "./api";
import {
  SAMPLE_DISH,
  SAMPLE_FRIDGE,
  buildUserContext,
  clearSessionState,
  eatFirstItemStatesFromMarks,
  fallbackDinnerPlan,
  fallbackTargetPlan,
  feedbackOptionByType,
  isFixedDemoResult,
  loadInventorySnapshot,
  loadSessionState,
  namesMatch,
  normalizeDinnerPlan,
  normalizeTargetPlanData,
  readableDishNameFromFile,
  rescueSymptomByKey,
  saveInventorySnapshot,
  saveSessionState,
  timeOptionById,
} from "./model";
import { getCookingContext } from "./steps";
import HomeScene from "./scenes/HomeScene";
import DishScene from "./scenes/DishScene";
import FridgeScene from "./scenes/FridgeScene";
import TicketScene from "./scenes/TicketScene";
import RescueScene from "./scenes/RescueScene";
import LifeLogScene from "./scenes/LifeLogScene";
import WaitingOverlay from "./scenes/WaitingOverlay";

let planSeq = 1;

export default function TonightApp() {
  const [route, setRoute] = useState(null); // "feed" | "fridge"
  const [scene, setScene] = useState("home"); // home | dish | fridge | ticket
  const [dish, setDish] = useState(null);
  const [timeBudgetId, setTimeBudgetId] = useState(null);
  const [timeBudgetAuto, setTimeBudgetAuto] = useState(false);
  const [note, setNote] = useState("");
  const [fridge, setFridge] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [inventoryMode, setInventoryMode] = useState("vision"); // vision | last | manual | empty
  const [inventoryConfirmed, setInventoryConfirmed] = useState(false);
  const [eatFirstMarks, setEatFirstMarks] = useState({}); // { [name]: {opened, labelSoon, unsure} }
  const [stepPositions, setStepPositions] = useState({}); // { [planId]: number } 仅用户显式标记
  const [rescue, setRescue] = useState(null); // 做饭救援：冻结方案快照 + 草稿 + 已完成轮次，不含原始照片
  const [lifeLog, setLifeLog] = useState(null); // 生活记录：绑定 planId 的草稿会话，不含原始照片
  const [lifeLogDrafts, setLifeLogDrafts] = useState({}); // { [planId]: 已保存草稿（纯文本） }
  const [intent, setIntent] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [pending, setPending] = useState(null); // {kind, label, startedAt}
  const [planError, setPlanError] = useState(null); // 首次规划失败
  const [notice, setNotice] = useState("");
  const [interrupted, setInterrupted] = useState(null);
  const [reshootResult, setReshootResult] = useState(null); // {key, items:[name]}

  const abortRef = useRef(null);
  const restoredRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const showNotice = useCallback((text) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const selectTimeBudget = useCallback((id) => {
    setTimeBudgetId(id);
    setTimeBudgetAuto(false);
  }, []);

  // ---------- 会话恢复（不含原始照片） ----------

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadSessionState();
    if (saved) {
      // 旧会话中断归属：dish-rescue 必须同时有 planId 与严格 scope；life-log 只要求 planId；
      // 两者缺归属字段都丢弃；规划类全局中断维持原规则
      if (saved.pendingKind) {
        if (saved.pendingKind === "dish-rescue") {
          if (saved.pendingPlanId && (saved.pendingScope === "plan" || saved.pendingScope === "demo")) {
            setInterrupted({ kind: saved.pendingKind, planId: saved.pendingPlanId, scope: saved.pendingScope });
          }
        } else if (saved.pendingKind === "life-log") {
          if (saved.pendingPlanId) {
            setInterrupted({ kind: saved.pendingKind, planId: saved.pendingPlanId, scope: saved.pendingScope || null });
          }
        } else {
          setInterrupted({ kind: saved.pendingKind, planId: saved.pendingPlanId || null, scope: saved.pendingScope || null });
        }
      }
      setRoute(saved.route || null);
      setDish(saved.dish ? { ...saved.dish, image: null, analysis: saved.dish.analysis || null } : null);
      setTimeBudgetId(saved.timeBudgetId || null);
      setTimeBudgetAuto(Boolean(saved.timeBudgetAuto));
      setNote(saved.note || "");
      setFridge(saved.fridge ? { ...saved.fridge, image: null, vision: saved.fridge.vision || null } : null);
      setInventory(Array.isArray(saved.inventory) ? saved.inventory : []);
      setInventoryMode(saved.inventoryMode || "vision");
      setInventoryConfirmed(Boolean(saved.inventoryConfirmed));
      setEatFirstMarks(saved.eatFirstMarks && typeof saved.eatFirstMarks === "object" ? saved.eatFirstMarks : {});
      setStepPositions(saved.stepPositions && typeof saved.stepPositions === "object" ? saved.stepPositions : {});
      setRescue(saved.rescue && typeof saved.rescue === "object" ? saved.rescue : null);
      setLifeLog(saved.lifeLog && typeof saved.lifeLog === "object" ? saved.lifeLog : null);
      setLifeLogDrafts(saved.lifeLogDrafts && typeof saved.lifeLogDrafts === "object" ? saved.lifeLogDrafts : {});
      setIntent(saved.intent || null);
      const savedPlans = Array.isArray(saved.plans) ? saved.plans : [];
      setPlans(savedPlans);
      planSeq = Math.max(planSeq, ...savedPlans.map((entry, index) => Number(entry.sequence || index + 1) + 1));
      setActivePlanId(saved.activePlanId || null);
      // 恢复优先级：救援/生活记录（含草稿）> 行动单 > 库存 > 菜图；在途请求只标中断，不静默重发
      if (saved.scene === "rescue" && saved.rescue?.planSnapshot) setScene("rescue");
      else if (saved.scene === "lifelog" && saved.lifeLog?.planId) setScene("lifelog");
      else if (saved.plans?.length) setScene("ticket");
      else if (saved.scene === "fridge" || saved.inventoryConfirmed || saved.inventoryMode === "empty" || saved.fridge?.vision) setScene("fridge");
      else if (saved.dish) setScene("dish");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSessionState({
      route,
      scene,
      dish: dish ? { imageSource: dish.imageSource, fileName: dish.fileName, name: dish.name, nameLocked: dish.nameLocked, analysis: dish.analysis } : null,
      timeBudgetId,
      timeBudgetAuto,
      note,
      fridge: fridge ? { imageSource: fridge.imageSource, fileName: fridge.fileName, vision: fridge.vision, visionSource: fridge.visionSource, status: fridge.status } : null,
      inventory,
      inventoryMode,
      inventoryConfirmed,
      eatFirstMarks,
      stepPositions,
      rescue,
      lifeLog,
      lifeLogDrafts,
      intent,
      plans,
      activePlanId,
      pendingKind: pending?.kind || null,
      pendingPlanId: pending?.planId || null,
      pendingScope: pending?.scope || null,
    });
  }, [hydrated, route, scene, dish, timeBudgetId, timeBudgetAuto, note, fridge, inventory, inventoryMode, inventoryConfirmed, eatFirstMarks, stepPositions, rescue, lifeLog, lifeLogDrafts, intent, plans, activePlanId, pending]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [scene, activePlanId]);

  // 中断事实按方案归属：进入不匹配的救援/生活记录会话时清除陈旧中断；
  // 救援还需同时匹配 planId 与 mode scope，真实救援与独立示例救援互不串提示
  useEffect(() => {
    if (!interrupted?.planId) return;
    if (interrupted.kind === "dish-rescue" && scene === "rescue" && rescue) {
      const planMismatch = interrupted.planId !== rescue.sourcePlanId;
      const scopeMismatch = interrupted.scope !== rescue.mode; // 严格匹配，缺 scope 即不匹配
      if (planMismatch || scopeMismatch) setInterrupted(null);
    }
    if (interrupted.kind === "life-log" && scene === "lifelog" && lifeLog && interrupted.planId !== lifeLog.planId) {
      setInterrupted(null);
    }
  }, [interrupted, scene, rescue, lifeLog]);

  // ---------- 等待与中断 ----------

  function beginPending(kind, label, extra = null) {
    const controller = new AbortController();
    abortRef.current = controller;
    setInterrupted(null); // 新请求开始后，旧中断事实不再相关
    setPending({ kind, label, startedAt: Date.now(), ...(extra || {}) });
    return controller.signal;
  }

  function endPending() {
    abortRef.current = null;
    setPending(null);
  }

  function cancelPending() {
    abortRef.current?.abort();
  }

  // ---------- 目标菜（F1） ----------

  const runDishVision = useCallback(async (image, fileName, imageSource) => {
    const signal = beginPending("dish-vision", "正在认这道菜");
    try {
      const data = await api.analyzeTargetDish({
        imageDataUrl: image,
        demoKey: imageSource === "sample" ? SAMPLE_DISH.demoKey : undefined,
      }, { signal });
      const analysis = data.targetVision || {};
      setDish((cur) => {
        if (!cur) return cur;
        const recognized = String(analysis.dishName || "").trim();
        const fallbackName = readableDishNameFromFile(fileName);
        return {
          ...cur,
          analysis,
          analysisSource: data.source || "model",
          name: cur.nameLocked ? cur.name : recognized || fallbackName || cur.name,
        };
      });
    } catch (error) {
      if (signal.aborted) return; // 用户主动取消：静默返回
      setDish((cur) => (cur ? { ...cur, analysis: null, analysisSource: "failed" } : cur));
      showNotice("没认出这道菜，请直接输入菜名");
    } finally {
      endPending();
    }
  }, [showNotice]);

  const acceptDishImage = useCallback(async (file, imageSource) => {
    try {
      const image = await compressImage(file);
      const fileName = imageSource === "sample" ? SAMPLE_DISH.fileName : file.name;
      setDish({
        image,
        originalImage: image,
        imageSource,
        fileName,
        analysis: null,
        analysisSource: null,
        name: imageSource === "sample" ? "" : readableDishNameFromFile(fileName),
        nameLocked: false,
      });
      setRoute("feed");
      setScene("dish");
      if (imageSource === "sample") {
        setTimeBudgetId((cur) => {
          if (cur) return cur;
          setTimeBudgetAuto(true);
          return "25";
        });
      } else if (timeBudgetAuto) {
        setTimeBudgetId(null);
        setTimeBudgetAuto(false);
      }
      runDishVision(image, fileName, imageSource);
    } catch (error) {
      showNotice(error.message || "图片读取失败");
    }
  }, [runDishVision, showNotice, timeBudgetAuto]);

  const loadSampleDish = useCallback(async () => {
    try {
      const file = await fetchAssetFile(SAMPLE_DISH.url, SAMPLE_DISH.fileName);
      await acceptDishImage(file, "sample");
    } catch (error) {
      showNotice(error.message || "示例图片加载失败");
    }
  }, [acceptDishImage, showNotice]);

  const recropDish = useCallback((croppedImage) => {
    setDish((cur) => (cur ? { ...cur, image: croppedImage } : cur));
    runDishVision(croppedImage, "roi.jpg", "roi");
  }, [dish, runDishVision]);

  const restoreDishImage = useCallback(() => {
    if (!dish?.originalImage) return;
    setDish((cur) => (cur ? { ...cur, image: cur.originalImage } : cur));
    runDishVision(dish.originalImage, dish.fileName || "dish.jpg", dish.imageSource || "album");
  }, [dish, runDishVision]);

  // ---------- 冰箱识别（F2/R1） ----------

  const runFridgeVision = useCallback(async (image, fileName, imageSource) => {
    const signal = beginPending("fridge-vision", "正在看冰箱");
    try {
      const data = await api.analyzeFridge({
        imageDataUrl: image,
        demoKey: imageSource === "sample" ? SAMPLE_FRIDGE.demoKey : undefined,
      }, { signal });
      const vision = data.vision || { items: [], uncertainItems: [], warnings: [] };
      const sceneTag = vision.sceneAssessment?.kind || vision.scene || data.scene || "unknown";
      setFridge({
        image,
        imageSource,
        fileName,
        vision,
        visionSource: data.source || "model",
        status: sceneTag === "fridge" ? "ok" : sceneTag === "not_fridge" ? "not_fridge" : sceneTag === "unusable" ? "unusable" : "unknown",
      });
      setInventoryMode("vision");
      setInventoryConfirmed(false);
      setReshootResult(null);
    } catch (error) {
      if (signal.aborted) return; // 用户主动取消：静默返回，不显示为失败
      setFridge({ image, imageSource, fileName, vision: null, visionSource: null, status: "failed" });
    } finally {
      endPending();
    }
  }, []);

  const acceptFridgeImage = useCallback(async (file, imageSource) => {
    try {
      const image = await compressImage(file);
      const fileName = imageSource === "sample" ? SAMPLE_FRIDGE.fileName : file.name;
      setInventory([]);
      setInventoryConfirmed(false);
      // 换了真实照片：旧照片上的先吃标记不能套到新实物
      setEatFirstMarks({});
      if (imageSource !== "sample" && timeBudgetAuto && route === "fridge") {
        setTimeBudgetId(null);
        setTimeBudgetAuto(false);
      }
      runFridgeVision(image, fileName, imageSource);
    } catch (error) {
      showNotice(error.message || "图片读取失败");
    }
  }, [runFridgeVision, showNotice, timeBudgetAuto, route]);

  const loadSampleFridge = useCallback(async () => {
    try {
      const file = await fetchAssetFile(SAMPLE_FRIDGE.url, SAMPLE_FRIDGE.fileName);
      await acceptFridgeImage(file, "sample");
      if (route === "fridge") {
        setTimeBudgetId((cur) => {
          if (cur) return cur;
          setTimeBudgetAuto(true);
          return "25";
        });
      }
    } catch (error) {
      showNotice(error.message || "示例冰箱加载失败");
    }
  }, [acceptFridgeImage, route, showNotice]);

  const useLastInventory = useCallback(() => {
    const snapshot = loadInventorySnapshot();
    if (!snapshot) {
      showNotice("这台设备上还没有上次确认的库存");
      return;
    }
    setInventory(snapshot.items);
    setInventoryMode("last");
    setInventoryConfirmed(false);
    setEatFirstMarks({}); // 库存来源换成上次快照：重新核对后再标
    setFridge(null);
    setScene("fridge");
  }, [showNotice]);

  const reshootUnsure = useCallback(async (file, key) => {
    let image;
    try {
      image = await compressImage(file);
    } catch (error) {
      showNotice(error.message || "图片读取失败");
      return;
    }
    const signal = beginPending("reshoot", "正在看这一处");
    try {
      const data = await api.analyzeFridge({ imageDataUrl: image, analysisMode: "fridge_detail" }, { signal });
      const items = (data.vision?.items || []).map((item) => String(item?.name || "").trim()).filter(Boolean).slice(0, 4);
      setReshootResult({ key, items, source: data.source || "model" });
    } catch {
      if (!signal.aborted) setReshootResult({ key, items: [], source: "failed" });
    } finally {
      endPending();
    }
  }, [showNotice]);

  const resetFridgeCapture = useCallback(() => {
    setFridge(null);
    setInventory([]);
    setInventoryMode("vision");
    setInventoryConfirmed(false);
    setEatFirstMarks({});
    setReshootResult(null);
  }, []);

  // ---------- 先吃标记（用户确认状态，规则失败不阻断规划） ----------

  const toggleEatFirstMark = useCallback((name, key) => {
    setEatFirstMarks((cur) => {
      const prev = cur[name] || { opened: false, labelSoon: false, unsure: false };
      const next = { ...prev, [key]: !prev[key] };
      if (key === "unsure" && next.unsure) { next.opened = false; next.labelSoon = false; }
      if ((key === "opened" || key === "labelSoon") && next[key]) next.unsure = false;
      const copy = { ...cur };
      if (next.opened || next.labelSoon || next.unsure) copy[name] = next;
      else delete copy[name];
      return copy;
    });
  }, []);

  // 确定性规则端点：毫秒级，失败时返回 applied:false 快照，规划继续但不冒充已生效
  async function resolveEatFirst(itemStates) {
    if (!itemStates?.length) return null;
    try {
      const data = await api.eatFirst({ itemStates }, { timeoutMs: 6000 });
      const result = data.eatFirst || {};
      return {
        applied: true,
        itemStates,
        plannerPriorities: Array.isArray(result.plannerPriorities) ? result.plannerPriorities : [],
        needsConfirmation: (result.needsConfirmation || []).map((item) => item.name || item).filter(Boolean),
        summary: String(result.summary || ""),
        source: "user-confirmed",
      };
    } catch {
      return { applied: false, itemStates, plannerPriorities: [], needsConfirmation: [], summary: "", source: "rules-failed" };
    }
  }

  // ---------- 规划（W → T） ----------

  // 严格快照派生：重规划原样继承用户当前查看版本的完整先吃结果
  // （含 applied:false 与空结果），不再次调用 /api/eat-first；
  // 只有 2a 以前没有 eatFirst 字段的旧版本才回退当前全局标记
  function inheritEatFirstSnapshot(active) {
    const snap = active?.requestSnapshot;
    if (snap && "eatFirst" in snap) return snap.eatFirst ?? null;
    return undefined;
  }

  const startPlanning = useCallback(async ({
    mode,
    dishName,
    feedbackType = null,
    alternative = false,
    alternativeFrom = null,
    cartItems = [],
    acquiredItems = [],
    inventorySnapshot = inventory,
    inventoryModeSnapshot = inventoryMode,
    timeBudgetIdSnapshot = timeBudgetId,
    noteSnapshot = note,
    inputProvenance = null,
    eatFirstItemStates = null,
    resolvedEatFirst = null,
    inheritedEatFirst = undefined,
  }) => {
    const baseInventory = Array.isArray(inventorySnapshot) ? inventorySnapshot : [];
    const timeBudget = timeOptionById(timeBudgetIdSnapshot);
    const realAcquired = [...new Set(acquiredItems.map((name) => String(name || "").trim()).filter(Boolean))];
    const simulated = [...new Set(cartItems.map((name) => String(name || "").trim()).filter(Boolean))];
    const planningInventory = [
      ...baseInventory,
      ...realAcquired.map((name) => ({ name, category: "本次已拿到", quantityEstimate: "", state: "用户确认本次已经拿到", notes: "" })),
    ];
    const provenance = inputProvenance || {
      dishImageSource: dish?.imageSource || null,
      dishAnalysisSource: dish?.analysisSource || null,
      fridgeImageSource: fridge?.imageSource || null,
      fridgeAnalysisSource: fridge?.visionSource || null,
      inventoryMode: inventoryModeSnapshot,
    };
    // 默认从当前先吃标记派生；失败重试等场景用调用方冻结的快照
    const efStates = eatFirstItemStates
      || eatFirstItemStatesFromMarks(eatFirstMarks, baseInventory.map((item) => String(item?.name || item || "").trim()).filter(Boolean));
    const frozenArgs = {
      mode, dishName, feedbackType, alternative, alternativeFrom,
      cartItems: simulated, acquiredItems: realAcquired,
      inventorySnapshot: baseInventory, inventoryModeSnapshot,
      timeBudgetIdSnapshot, noteSnapshot,
      inputProvenance: provenance, eatFirstItemStates: efStates,
    };
    const signal = beginPending("plan", alternativeFrom?.candidateName ? "正在换个思路想办法" : mode === "target" ? "正在看家里够不够做" : "正在按你有的食材想办法");
    // 不在此处清空 planError：重试途中取消时，失败卡片必须仍然可用，否则行动单会空白
    try {
      // 优先级：继承当前查看版本的完整快照 > 重试冻结结果 > 重新解析规则
      const eatFirstSnap = inheritedEatFirst !== undefined
        ? inheritedEatFirst
        : resolvedEatFirst || await resolveEatFirst(efStates);
      frozenArgs.resolvedEatFirst = eatFirstSnap;
      if (signal.aborted) return;
      const userContext = buildUserContext({
        timeBudget,
        note: noteSnapshot,
        feedbackType,
        alternative,
        alternativeFrom,
        eatFirstPriorities: eatFirstSnap?.applied ? eatFirstSnap.plannerPriorities : [],
      });
      if (mode === "target") {
        const text = `我今晚想吃${dishName}`;
        const imageAnalysis = dish?.analysis && namesMatch(dish.analysis.dishName, dishName) ? dish.analysis : null;
        const data = await api.planTargetDish({
          inventory: planningInventory,
          userContext,
          targetDish: {
            text,
            intentTime: "tonight",
            imageAnalysis,
            shoppingDecision: simulated.length ? { mode: "simulate_after_purchase", acceptedItems: simulated } : null,
          },
        }, { signal });
        commitPlan({
          mode: "target",
          plan: normalizeTargetPlanData(data.targetPlan),
          source: data.source || "model",
          snapshotLabel: versionLabel({ mode: "target", dishName, timeBudget, feedbackType, alternativeFrom, cartItems: simulated, acquiredItems: realAcquired }),
          shoppingPreview: simulated.length ? { acceptedItems: simulated } : null,
          materialState: { acquiredItems: realAcquired, simulatedItems: simulated },
          inputProvenance: provenance,
          requestSnapshot: {
            dishName,
            timeBudgetId: timeBudgetIdSnapshot,
            availableCookingTime: timeBudget?.value || "由用户确认",
            inventory: baseInventory,
            inventoryCount: baseInventory.length,
            inventoryMode: inventoryModeSnapshot,
            note: noteSnapshot,
            eatFirst: eatFirstSnap,
            alternativeFrom,
          },
        });
      } else {
        const data = await api.planDinner({ inventory: planningInventory, userContext }, { signal });
        commitPlan({
          mode: "free",
          plan: normalizeDinnerPlan(data.plan),
          source: data.source || "model",
          snapshotLabel: versionLabel({ mode: "free", timeBudget, feedbackType, alternativeFrom, cartItems: simulated, acquiredItems: realAcquired }),
          shoppingPreview: null,
          materialState: { acquiredItems: realAcquired, simulatedItems: simulated },
          inputProvenance: provenance,
          requestSnapshot: {
            timeBudgetId: timeBudgetIdSnapshot,
            availableCookingTime: timeBudget?.value || "由用户确认",
            inventory: baseInventory,
            inventoryCount: baseInventory.length,
            inventoryMode: inventoryModeSnapshot,
            note: noteSnapshot,
            eatFirst: eatFirstSnap,
            alternativeFrom,
          },
        });
      }
      setPlanError(null); // 只在成功时清失败卡；重试取消不抹掉原失败出口
      setScene("ticket");
    } catch (error) {
      if (signal.aborted) return; // 用户主动取消：静默返回
      if (plans.length === 0) {
        // 冻结首次请求的完整参数：重试按原条件重发，不用当前可能已变的 UI 状态重新拼装
        setPlanError({ message: error.message || "规划失败", requestArgs: frozenArgs });
        setScene("ticket");
      } else {
        showNotice("这次重新规划失败了，当前方案仍保留");
      }
    } finally {
      endPending();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeBudgetId, note, inventory, inventoryMode, eatFirstMarks, dish, fridge, plans.length]);

  function versionLabel({ mode, dishName, timeBudget, feedbackType, alternativeFrom, cartItems, acquiredItems }) {
    const parts = [mode === "target" ? `目标菜 · ${dishName}` : "按库存安排"];
    if (timeBudget) parts.push(timeBudget.label);
    const fb = feedbackOptionByType(feedbackType);
    if (fb && !fb.recordOnly) parts.push(`反馈：${fb.label}`);
    if (alternativeFrom?.candidateName) parts.push(`换个思路 · ${alternativeFrom.candidateName}`);
    if (cartItems?.length) parts.push(`模拟补购 ${cartItems.length} 样`);
    if (acquiredItems?.length) parts.push(`已拿到 ${acquiredItems.length} 样`);
    return parts.join(" · ");
  }

  function commitPlan({ mode, plan, source, snapshotLabel, shoppingPreview, materialState, inputProvenance, requestSnapshot }) {
    const sequence = planSeq++;
    const entry = {
      id: `v${Date.now()}-${sequence}`,
      sequence,
      mode,
      plan,
      source,
      snapshotLabel,
      shoppingPreview,
      materialState: materialState || { acquiredItems: [], simulatedItems: [] },
      inputProvenance: inputProvenance || null,
      requestSnapshot,
      createdAt: new Date().toISOString(),
    };
    setPlans((cur) => [...cur, entry].slice(-3));
    setActivePlanId(entry.id);
  }

  const [fallbackBusy, setFallbackBusy] = useState(false);

  const useRulesFallback = useCallback(async () => {
    if (fallbackBusy) return; // 防重复点击生成多个兜底版本
    setFallbackBusy(true);
    try {
      // 优先沿用首次请求冻结的条件，避免兜底版本与失败请求的条件不一致
      const frozen = planError?.requestArgs || null;
      const fbInventory = frozen?.inventorySnapshot || inventory;
      const fbInventoryMode = frozen?.inventoryModeSnapshot || inventoryMode;
      const fbTimeId = frozen?.timeBudgetIdSnapshot || timeBudgetId;
      const fbNote = frozen?.noteSnapshot ?? note;
      const timeBudget = timeOptionById(fbTimeId);
      const mode = frozen?.mode || (intent?.type === "target_dish" ? "target" : "free");
      const dishName = frozen?.dishName || intent?.dishName;
      const efStates = frozen?.eatFirstItemStates
        || eatFirstItemStatesFromMarks(eatFirstMarks, fbInventory.map((item) => String(item?.name || item || "").trim()).filter(Boolean));
      // 冻结里有首次真正生效的先吃结果就直接沿用，不重新调用规则
      const eatFirstSnap = frozen?.resolvedEatFirst || await resolveEatFirst(efStates);
      commitPlan({
        mode,
        plan: mode === "target"
          ? fallbackTargetPlan(dishName, fbInventory, timeBudget)
          : fallbackDinnerPlan(fbInventory, timeBudget),
        source: "rules-fallback",
        snapshotLabel: "规则兜底（非本次模型结果）",
        shoppingPreview: null,
        materialState: { acquiredItems: [], simulatedItems: [] },
        inputProvenance: frozen?.inputProvenance || {
          dishImageSource: dish?.imageSource || null,
          dishAnalysisSource: dish?.analysisSource || null,
          fridgeImageSource: fridge?.imageSource || null,
          fridgeAnalysisSource: fridge?.visionSource || null,
          inventoryMode: fbInventoryMode,
        },
        requestSnapshot: {
          dishName: mode === "target" ? dishName : undefined,
          timeBudgetId: fbTimeId,
          availableCookingTime: timeBudget?.value || "由用户确认",
          inventory: fbInventory,
          inventoryCount: fbInventory.length,
          inventoryMode: fbInventoryMode,
          note: fbNote,
          eatFirst: eatFirstSnap,
        },
      });
      setPlanError(null);
      setScene("ticket");
    } finally {
      setFallbackBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackBusy, planError, intent, inventory, inventoryMode, timeBudgetId, note, eatFirstMarks, dish, fridge]);

  // ---------- 反馈 / 补购 / 已拿到 ----------

  const applyFeedback = useCallback(async (option, mealName) => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!active) return;
    const feedbackType = option.type === "fit" ? "accept_meal" : option.type;
    let recorded = false;
    try {
      await api.recordFeedback({ type: feedbackType, mealName });
      recorded = true;
    } catch {
      // 本地记忆不可用时，本次会话约束仍然生效
    }
    if (option.recordOnly) {
      showNotice(recorded ? "已记下：这版正合适" : "这版本次已确认；长期记录暂未保存");
      return;
    }
    return startPlanning({
      mode: active?.mode === "target" ? "target" : "free",
      dishName: active?.mode === "target" ? active.plan?.targetDish?.name : undefined,
      feedbackType: option.type,
      inventorySnapshot: active.requestSnapshot?.inventory || inventory,
      inventoryModeSnapshot: active.requestSnapshot?.inventoryMode || inventoryMode,
      timeBudgetIdSnapshot: active.requestSnapshot?.timeBudgetId || timeBudgetId,
      noteSnapshot: active.requestSnapshot?.note ?? note,
      acquiredItems: active.materialState?.acquiredItems || [],
      cartItems: active.materialState?.simulatedItems || [],
      inputProvenance: active.inputProvenance,
      inheritedEatFirst: inheritEatFirstSnapshot(active),
    });
  }, [plans, activePlanId, startPlanning, showNotice, inventory, inventoryMode, timeBudgetId, note]);

  const applyCartReplan = useCallback((items) => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!items.length || active?.mode !== "target") return;
    return startPlanning({
      mode: "target",
      dishName: active.plan?.targetDish?.name,
      cartItems: items,
      acquiredItems: active.materialState?.acquiredItems || [],
      inventorySnapshot: active.requestSnapshot?.inventory || inventory,
      inventoryModeSnapshot: active.requestSnapshot?.inventoryMode || inventoryMode,
      timeBudgetIdSnapshot: active.requestSnapshot?.timeBudgetId || timeBudgetId,
      noteSnapshot: active.requestSnapshot?.note ?? note,
      inputProvenance: active.inputProvenance,
      inheritedEatFirst: inheritEatFirstSnapshot(active),
    });
  }, [plans, activePlanId, startPlanning, inventory, inventoryMode, timeBudgetId, note]);

  const applyGotIt = useCallback((names) => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!names.length || !active) return;
    const currentAcquired = active.materialState?.acquiredItems || [];
    const acquired = [...new Set([...currentAcquired, ...names])];
    const simulated = (active.materialState?.simulatedItems || []).filter(
      (item) => !acquired.some((name) => namesMatch(name, item)),
    );
    const missing = active.mode === "target"
      ? [
        ...(active.plan?.inventoryMatch?.missingCritical || []),
        ...(active.plan?.shoppingPlan?.mustBuy || []).map((b) => b.item),
        ...(active.materialState?.simulatedItems || []),
      ]
      : [];
    const coveredAll = missing.length > 0 && missing.every((m) => acquired.some((n) => namesMatch(n, m)));
    if (coveredAll) {
      // 确认拿到的正好是全部缺料：只更新本次执行状态，不再调用模型
      setPlans((cur) => cur.map((entry) => entry.id === active.id ? {
        ...entry,
        materialState: { acquiredItems: acquired, simulatedItems: simulated },
        shoppingPreview: simulated.length ? { acceptedItems: simulated } : null,
      } : entry));
      showNotice("已记下：本次材料已拿到，不重新规划");
      return Promise.resolve();
    }
    // 只拿到一部分：以真实身份进入库存，发起新规划并生成新版本
    return startPlanning({
      mode: active.mode === "target" ? "target" : "free",
      dishName: active.mode === "target" ? active.plan?.targetDish?.name : undefined,
      acquiredItems: acquired,
      cartItems: simulated,
      inventorySnapshot: active.requestSnapshot?.inventory || inventory,
      inventoryModeSnapshot: active.requestSnapshot?.inventoryMode || inventoryMode,
      timeBudgetIdSnapshot: active.requestSnapshot?.timeBudgetId || timeBudgetId,
      noteSnapshot: active.requestSnapshot?.note ?? note,
      inputProvenance: active.inputProvenance,
      inheritedEatFirst: inheritEatFirstSnapshot(active),
    });
  }, [plans, activePlanId, startPlanning, showNotice, inventory, inventoryMode, timeBudgetId, note]);

  // 「另一个思路」：冻结来源版本与候选菜，仍走自由推荐；库存现实可能让结果偏离候选
  const applyAlternative = useCallback(({ sourcePlanId, candidateName, candidateWhy }) => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!active || active.mode !== "free" || !candidateName) return;
    return startPlanning({
      mode: "free",
      // 血缘在生成时冻结（含来源序号），来源版本被裁掉后仍能如实标注
      alternativeFrom: { sourcePlanId, candidateName, candidateWhy, sourceSequence: active.sequence },
      inventorySnapshot: active.requestSnapshot?.inventory || inventory,
      inventoryModeSnapshot: active.requestSnapshot?.inventoryMode || inventoryMode,
      timeBudgetIdSnapshot: active.requestSnapshot?.timeBudgetId || timeBudgetId,
      noteSnapshot: active.requestSnapshot?.note ?? note,
      acquiredItems: active.materialState?.acquiredItems || [],
      inputProvenance: active.inputProvenance,
      inheritedEatFirst: inheritEatFirstSnapshot(active),
    });
  }, [plans, activePlanId, startPlanning, inventory, inventoryMode, timeBudgetId, note]);

  // 步骤位置：仅用户在大字视图里显式点「我现在做到这一步」时写入，浏览不产生位置
  const markStepPosition = useCallback((planId, stepIndex) => {
    setStepPositions((cur) => ({ ...cur, [planId]: stepIndex }));
    showNotice(`已记下：你做到第 ${stepIndex + 1} 步`);
  }, [showNotice]);

  // ---------- 做饭救援（最多两轮，冻结进入时查看的版本） ----------

  const openRescue = useCallback(() => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!active) return; // 无方案版本不允许凭空进入真实救援
    setRescue((cur) => {
      const { steps } = getCookingContext(active);
      const baseSnapshot = {
        dishName: active.mode === "target" ? active.plan?.targetDish?.name : active.plan?.baseMeal?.name,
        steps,
        versionLabel: active.snapshotLabel || "",
        sequence: active.sequence,
      };
      const freshDraft = {
        stepIndex: typeof stepPositions[active.id] === "number" ? stepPositions[active.id] : null,
        stepUnknown: false,
        stepTouched: false,
        symptomKey: null,
        description: "",
        outcome: null,
      };
      // 已有轮次：完全冻结，不改历史上下文
      if (cur && cur.mode === "plan" && cur.sourcePlanId === active.id && cur.rounds.length > 0) return cur;
      // 空会话（同方案）：刷新有效步骤快照；用户主动选过的步骤保留，否则用最新位置标记
      if (cur && cur.mode === "plan" && cur.sourcePlanId === active.id) {
        // 新旧会话分开判断：有 stepTouched 字段只认严格 true；
        // 没有该字段的旧草稿才按 stepUnknown 或有效 stepIndex 推断曾主动选择
        const hasTouchedField = cur.draft ? Object.prototype.hasOwnProperty.call(cur.draft, "stepTouched") : false;
        const draftTouched = hasTouchedField
          ? cur.draft.stepTouched === true
          : Boolean(cur.draft?.stepUnknown) || typeof cur.draft?.stepIndex === "number";
        const draft = draftTouched
          ? { ...cur.draft, stepTouched: true }
          : { ...cur.draft, stepIndex: freshDraft.stepIndex, stepUnknown: false, stepTouched: false };
        return { ...cur, planSnapshot: baseSnapshot, draft };
      }
      // 新会话（含从示例返回）：冻结当前查看版本
      return {
        mode: "plan",
        sourcePlanId: active.id,
        planSnapshot: baseSnapshot,
        demoAsset: null,
        draft: freshDraft,
        rounds: [],
        status: "intake",
      };
    });
    setScene("rescue");
  }, [plans, activePlanId, stepPositions]);

  // 示例翻车图：切换为独立示例会话，与本次晚餐方案无关；只演示第一轮
  const startDemoRescue = useCallback((sample) => {
    setRescue((cur) => (cur ? {
      ...cur,
      mode: "demo",
      demoAsset: sample,
      draft: { stepIndex: null, stepUnknown: false, stepTouched: false, symptomKey: null, description: "", outcome: null },
      rounds: [],
      status: "intake",
    } : cur));
  }, []);

  const exitDemoRescue = useCallback(() => {
    setRescue((cur) => (cur ? {
      ...cur,
      mode: "plan",
      demoAsset: null,
      draft: { stepIndex: typeof stepPositions[cur.sourcePlanId] === "number" ? stepPositions[cur.sourcePlanId] : null, stepUnknown: false, stepTouched: false, symptomKey: null, description: "", outcome: null },
      rounds: [],
      status: "intake",
    } : cur));
  }, [stepPositions]);

  const updateRescueDraft = useCallback((patch) => {
    setRescue((cur) => (cur ? { ...cur, draft: { ...cur.draft, ...patch } } : cur));
  }, []);

  const resetRescueRounds = useCallback(() => {
    setRescue((cur) => (cur ? {
      ...cur,
      draft: { stepIndex: cur.mode === "plan" && typeof stepPositions[cur.sourcePlanId] === "number" ? stepPositions[cur.sourcePlanId] : null, stepUnknown: false, stepTouched: false, symptomKey: null, description: "", outcome: null },
      rounds: [],
      status: "intake",
    } : cur));
  }, [stepPositions]);

  const enterRescueRound2 = useCallback(() => {
    setRescue((cur) => (cur && cur.rounds.length === 1 ? { ...cur, status: "intake" } : cur));
  }, []);

  const submitRescue = useCallback(async ({ image, fileName }) => {
    if (!rescue || !image) return;
    const { draft, rounds, mode, demoAsset, planSnapshot } = rescue;
    const symptomOption = mode === "demo"
      ? { label: demoAsset.symptomLabel, category: demoAsset.category, symptom: demoAsset.symptom }
      : rescueSymptomByKey(draft.symptomKey);
    if (!symptomOption) return;
    const isRound2 = rounds.length === 1;
    // 第二轮的「有好转 / 还是没好」必须由用户明确选择
    if (isRound2 && mode !== "demo" && draft.outcome !== "recheck" && draft.outcome !== "not_improved") return;
    const previous = isRound2 ? rounds[0].result : null;
    const signal = beginPending("dish-rescue", mode === "demo" ? "正在看示例现场" : "正在看现场情况", { demo: mode === "demo", planId: rescue.sourcePlanId, scope: mode });
    try {
      const data = await api.rescueDish({
        imageDataUrl: image,
        sourceFileName: fileName,
        demoKey: mode === "demo" ? demoAsset.key : undefined,
        category: symptomOption.category,
        symptom: symptomOption.symptom,
        description: draft.description || undefined,
        dishContext: mode === "plan" ? {
          dishName: planSnapshot?.dishName || "",
          steps: planSnapshot?.steps || [],
          currentStep: !draft.stepUnknown && typeof draft.stepIndex === "number" ? planSnapshot?.steps?.[draft.stepIndex] || "" : "",
          stepNumber: !draft.stepUnknown && typeof draft.stepIndex === "number" ? draft.stepIndex + 1 : null,
        } : { dishName: demoAsset.dishName },
        followUp: isRound2 && previous ? {
          round: 2,
          outcome: draft.outcome === "not_improved" ? "not_improved" : "recheck",
          previousHeadline: previous.headline || "",
          previousAction: previous.actions?.[0]?.instruction || "",
          previousCheck: previous.actions?.[0]?.check || "",
        } : undefined,
      }, { signal });
      const round = {
        stepIndex: draft.stepUnknown ? null : draft.stepIndex,
        symptomLabel: symptomOption.label,
        description: draft.description || "",
        outcome: isRound2 ? (draft.outcome === "not_improved" ? "not_improved" : "recheck") : null,
        result: data.dishRescue || null,
        source: data.source || "model",
      };
      setRescue((cur) => (cur ? { ...cur, draft: { ...cur.draft, outcome: null }, rounds: [...cur.rounds, round], status: "result" } : cur));
    } catch (error) {
      if (!signal.aborted) showNotice(error.message || "救援请求失败；已填写的内容保留，可重试");
    } finally {
      endPending();
    }
  }, [rescue, showNotice]);

  // ---------- 饭后生活记录（按 planId 绑定，纯文本草稿，不发布） ----------

  const openLifeLog = useCallback(() => {
    const active = plans.find((p) => p.id === activePlanId);
    if (!active) return;
    setLifeLog((cur) => {
      if (cur && cur.planId === active.id) return cur; // 同方案：继续既有草稿会话
      const saved = lifeLogDrafts[active.id];
      const dishName = active.mode === "target" ? active.plan?.targetDish?.name : active.plan?.baseMeal?.name;
      if (saved) {
        return { planId: active.id, sequence: active.sequence, dishName: saved.dishName || dishName || "", status: "draft", result: saved, source: saved.source || "model" };
      }
      return { planId: active.id, sequence: active.sequence, dishName: dishName || "", status: "intake", result: null, source: null };
    });
    setScene("lifelog");
  }, [plans, activePlanId, lifeLogDrafts]);

  const submitLifeLog = useCallback(async ({ image, dishName }) => {
    if (!lifeLog || !image || !dishName) return;
    const signal = beginPending("life-log", "正在起草生活记录", { planId: lifeLog.planId });
    try {
      const data = await api.generateLifeLog({
        imageDataUrl: image,
        mealContext: { mealName: dishName, planVersion: lifeLog.sequence },
      }, { signal });
      const draft = data.lifeLog || {};
      setLifeLog((cur) => (cur ? {
        ...cur,
        dishName,
        status: "draft",
        source: data.source || "model",
        result: {
          dishName,
          selectedTitle: draft.titleOptions?.[0] || "",
          titleOptions: draft.titleOptions || [],
          coverText: draft.coverText || "",
          voiceoverDraft: draft.voiceoverDraft || "",
          visualSummary: draft.visualSummary || "",
          suggestedShots: draft.suggestedShots || [],
          tags: draft.tags || [],
          warnings: draft.warnings || [],
        },
      } : cur));
    } catch (error) {
      if (!signal.aborted) showNotice(error.message || "生成失败；照片和菜名都保留，可以直接重试");
    } finally {
      endPending();
    }
  }, [lifeLog, showNotice]);

  const updateLifeLog = useCallback((patch) => {
    setLifeLog((cur) => (cur ? { ...cur, ...patch } : cur));
  }, []);

  const updateLifeLogResult = useCallback((patch) => {
    setLifeLog((cur) => (cur?.result ? { ...cur, result: { ...cur.result, ...patch } } : cur));
  }, []);

  // 工作草稿按 planId 自动保存：任何编辑立即持久化；时间只存在于草稿存储中，
  // 比较时新旧两侧都剔除时间字段，仅打开/刷新同一份草稿不会刷新时间
  useEffect(() => {
    if (!lifeLog?.result || !lifeLog.planId) return;
    setLifeLogDrafts((drafts) => {
      const prev = drafts[lifeLog.planId];
      const { lastEditedAt: _prevTime, ...prevCore } = prev || {};
      const { lastEditedAt: _nextTime, ...resultCore } = lifeLog.result;
      const nextCore = { ...resultCore, dishName: lifeLog.dishName, source: lifeLog.source };
      if (prev && JSON.stringify(prevCore) === JSON.stringify(nextCore)) return drafts;
      return { ...drafts, [lifeLog.planId]: { ...nextCore, lastEditedAt: new Date().toISOString() } };
    });
  }, [lifeLog]);

  // 换一张成品图：回到填写态并清掉该方案的旧草稿，避免旧草稿与新照片混淆
  const retakeLifeLog = useCallback(() => {
    setLifeLog((cur) => {
      if (!cur) return cur;
      setLifeLogDrafts((drafts) => {
        if (!drafts[cur.planId]) return drafts;
        const next = { ...drafts };
        delete next[cur.planId];
        return next;
      });
      return { ...cur, status: "intake", result: null, source: null };
    });
  }, []);

  // ---------- 导航 ----------

  const restart = useCallback(() => {
    abortRef.current?.abort();
    clearSessionState();
    planSeq = 1; // 换一种开始 = 新的一餐，版本序号重置
    setRoute(null);
    setScene("home");
    setDish(null);
    setTimeBudgetId(null);
    setTimeBudgetAuto(false);
    setNote("");
    setFridge(null);
    setInventory([]);
    setInventoryMode("vision");
    setInventoryConfirmed(false);
    setEatFirstMarks({});
    setStepPositions({});
    setRescue(null);
    setLifeLog(null);
    setLifeLogDrafts({});
    setIntent(null);
    setPlans([]);
    setActivePlanId(null);
    setPending(null);
    setPlanError(null);
    setReshootResult(null);
    setInterrupted(null);
  }, []);

  const activePlan = plans.find((p) => p.id === activePlanId) || plans[plans.length - 1] || null;
  const fixedDemoDish = dish ? isFixedDemoResult(dish.analysisSource, dish.imageSource) : false;
  const fixedDemoFridge = fridge ? isFixedDemoResult(fridge.visionSource, fridge.imageSource) : false;

  return (
    <div className="tn-app" data-scene={scene}>
      <main className="tn-stage">
        {scene === "home" && (
          <HomeScene
            onWantThis={loadSampleDish}
            onFridgeFirst={() => { setRoute("fridge"); setScene("fridge"); }}
          />
        )}
        {scene === "dish" && dish && (
          <DishScene
            dish={dish}
            setDish={setDish}
            timeBudgetId={timeBudgetId}
            setTimeBudgetId={selectTimeBudget}
            note={note}
            setNote={setNote}
            fixedDemo={fixedDemoDish}
            onRecrop={recropDish}
            onRestoreOriginal={restoreDishImage}
            onReplaceImage={(file, source) => acceptDishImage(file, source)}
            onUseSample={loadSampleDish}
            onBack={() => setScene("home")}
            onConfirm={() => setScene("fridge")}
          />
        )}
        {scene === "fridge" && (
          <FridgeScene
            route={route}
            dishName={dish?.name || intent?.dishName || ""}
            dishAnalysis={dish?.analysis || null}
            fridge={fridge}
            fixedDemo={fixedDemoFridge}
            inventory={inventory}
            inventoryMode={inventoryMode}
            inventoryConfirmed={inventoryConfirmed}
            eatFirstMarks={eatFirstMarks}
            onToggleEatFirst={toggleEatFirstMark}
            timeBudgetId={timeBudgetId}
            setTimeBudgetId={selectTimeBudget}
            note={note}
            setNote={setNote}
            reshootResult={reshootResult}
            onCapture={acceptFridgeImage}
            onSampleFridge={loadSampleFridge}
            onUseLast={useLastInventory}
            onReshoot={reshootUnsure}
            onClearReshoot={() => setReshootResult(null)}
            onResetCapture={resetFridgeCapture}
            onConfirmInventory={(items, mode) => {
              setInventory(items);
              setInventoryMode(mode);
              setInventoryConfirmed(true);
              // 标记只绑定本次确认的库存：被点出库存的食材不再计入
              const confirmedNames = new Set(items.map((item) => String(item?.name || item || "").trim()).filter(Boolean));
              setEatFirstMarks((cur) => Object.fromEntries(Object.entries(cur).filter(([name]) => confirmedNames.has(name))));
              if (fridge?.imageSource !== "sample" && items.length > 0) {
                saveInventorySnapshot(items, { source: mode });
              }
              if (route === "feed") {
                const dishName = dish?.name || intent?.dishName;
                setIntent({ type: "target_dish", dishName });
                startPlanning({
                  mode: "target",
                  dishName,
                  inventorySnapshot: items,
                  inventoryModeSnapshot: mode,
                });
              }
              // 冰箱路线：由 FridgeScene 内部进入规划台步骤
            }}
            onBenchConfirm={({ intentType, dishName: benchDish, timeId, note: benchNote }) => {
              setIntent({ type: intentType, dishName: intentType === "target_dish" ? benchDish : "" });
              if (benchNote !== undefined) setNote(benchNote);
              startPlanning({
                mode: intentType === "target_dish" ? "target" : "free",
                dishName: benchDish,
                inventorySnapshot: inventory,
                inventoryModeSnapshot: inventoryMode,
                timeBudgetIdSnapshot: timeId || timeBudgetId,
                noteSnapshot: benchNote ?? note,
              });
            }}
            onBack={() => setScene(route === "feed" ? "dish" : "home")}
          />
        )}
        {scene === "ticket" && activePlan && (
          <TicketScene
            plan={activePlan}
            plans={plans}
            onSelectPlan={setActivePlanId}
            timeBudget={timeOptionById(activePlan.requestSnapshot?.timeBudgetId || timeBudgetId)}
            gotIt={activePlan.materialState?.acquiredItems || []}
            stepPosition={typeof stepPositions[activePlan.id] === "number" ? stepPositions[activePlan.id] : null}
            onMarkStep={(stepIndex) => markStepPosition(activePlan.id, stepIndex)}
            onFeedback={applyFeedback}
            onCartReplan={applyCartReplan}
            onGotIt={applyGotIt}
            onAlternative={applyAlternative}
            onAddTarget={(dishName) => startPlanning({
              mode: "target",
              dishName,
              inventorySnapshot: activePlan.requestSnapshot?.inventory || inventory,
              inventoryModeSnapshot: activePlan.requestSnapshot?.inventoryMode || inventoryMode,
              timeBudgetIdSnapshot: activePlan.requestSnapshot?.timeBudgetId || timeBudgetId,
              noteSnapshot: activePlan.requestSnapshot?.note ?? note,
              acquiredItems: activePlan.materialState?.acquiredItems || [],
              inputProvenance: activePlan.inputProvenance,
              inheritedEatFirst: inheritEatFirstSnapshot(activePlan),
            })}
            onEditFridge={() => setScene("fridge")}
            onRestart={restart}
            onRescue={openRescue}
            onLifeLog={openLifeLog}
          />
        )}
        {scene === "rescue" && rescue && (
          <RescueScene
            rescue={rescue}
            interrupted={
              interrupted?.kind === "dish-rescue"
              && interrupted.planId === rescue.sourcePlanId
              && interrupted.scope === rescue.mode
            }
            onDismissInterrupted={() => setInterrupted(null)}
            onUpdateDraft={updateRescueDraft}
            onSubmit={submitRescue}
            onStartDemo={startDemoRescue}
            onExitDemo={exitDemoRescue}
            onResetRounds={resetRescueRounds}
            onEnterRound2={enterRescueRound2}
            onBack={() => {
              // 示例不能黏住真实入口：离开示例回到行动单后，下次进入是真实方案救援
              if (rescue?.mode === "demo") setRescue(null);
              setScene("ticket");
            }}
          />
        )}
        {scene === "lifelog" && lifeLog && (
          <LifeLogScene
            lifeLog={lifeLog}
            lastEditedAt={lifeLogDrafts[lifeLog.planId]?.lastEditedAt || null}
            interrupted={interrupted?.kind === "life-log" && interrupted.planId === lifeLog.planId}
            onDismissInterrupted={() => setInterrupted(null)}
            onUpdate={updateLifeLog}
            onUpdateResult={updateLifeLogResult}
            onSubmit={submitLifeLog}
            onRetake={retakeLifeLog}
            onBack={() => setScene("ticket")}
            showNotice={showNotice}
          />
        )}
        {scene === "ticket" && !activePlan && planError && (
          <section className="tn-scene" aria-label="规划失败">
            <div className="tn-failbox">
              <p className="tn-failbox-title">这次没有生成方案</p>
              <p className="tn-failbox-detail">{planError.message}</p>
              <div className="tn-failbox-actions">
                <button type="button" className="tn-btn tn-btn-primary" disabled={fallbackBusy} onClick={() => startPlanning(planError.requestArgs || {})}>按原条件重试一次</button>
                <button type="button" className="tn-btn tn-btn-quiet" disabled={fallbackBusy} onClick={useRulesFallback}>
                  {fallbackBusy ? "正在生成保守方案…" : "先看一版保守方案（规则兜底，非本次模型结果）"}
                </button>
                <button type="button" className="tn-link" disabled={fallbackBusy} onClick={() => { setPlanError(null); setScene("fridge"); }}>回去改条件</button>
              </div>
              <p className="tn-foot-hint">重试会按你刚才确认的库存、时间和要求原样重新请求，不会改动任何条件。</p>
            </div>
          </section>
        )}
        {interrupted && interrupted.kind !== "life-log" && interrupted.kind !== "dish-rescue" && (
          <div className="tn-interrupted" role="status">
            <span>上次页面在请求中关闭；本页不会自动采用迟到的结果，也不会静默重发。</span>
            <button type="button" className="tn-chip tn-chip-mini" onClick={() => setInterrupted(null)}>知道了</button>
          </div>
        )}
        {notice && <div className="tn-toast" role="status">{notice}</div>}
        {pending && <WaitingOverlay pending={pending} onCancel={cancelPending} dishImage={dish?.image} fridgeImage={fridge?.image} />}
      </main>
    </div>
  );
}
