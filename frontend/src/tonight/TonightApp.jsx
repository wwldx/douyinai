import { useCallback, useEffect, useRef, useState } from "react";
import { api, compressImage, fetchAssetFile } from "./api";
import {
  SAMPLE_DISH,
  SAMPLE_FRIDGE,
  buildUserContext,
  clearSessionState,
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
  saveInventorySnapshot,
  saveSessionState,
  timeOptionById,
} from "./model";
import HomeScene from "./scenes/HomeScene";
import DishScene from "./scenes/DishScene";
import FridgeScene from "./scenes/FridgeScene";
import TicketScene from "./scenes/TicketScene";
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
      if (saved.pendingKind) setInterrupted({ kind: saved.pendingKind });
      setRoute(saved.route || null);
      setDish(saved.dish ? { ...saved.dish, image: null, analysis: saved.dish.analysis || null } : null);
      setTimeBudgetId(saved.timeBudgetId || null);
      setTimeBudgetAuto(Boolean(saved.timeBudgetAuto));
      setNote(saved.note || "");
      setFridge(saved.fridge ? { ...saved.fridge, image: null, vision: saved.fridge.vision || null } : null);
      setInventory(Array.isArray(saved.inventory) ? saved.inventory : []);
      setInventoryMode(saved.inventoryMode || "vision");
      setInventoryConfirmed(Boolean(saved.inventoryConfirmed));
      setIntent(saved.intent || null);
      const savedPlans = Array.isArray(saved.plans) ? saved.plans : [];
      setPlans(savedPlans);
      planSeq = Math.max(planSeq, ...savedPlans.map((entry, index) => Number(entry.sequence || index + 1) + 1));
      setActivePlanId(saved.activePlanId || null);
      if (saved.plans?.length) setScene("ticket");
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
      intent,
      plans,
      activePlanId,
      pendingKind: pending?.kind || null,
    });
  }, [hydrated, route, scene, dish, timeBudgetId, timeBudgetAuto, note, fridge, inventory, inventoryMode, inventoryConfirmed, intent, plans, activePlanId, pending]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [scene, activePlanId]);

  // ---------- 等待与中断 ----------

  function beginPending(kind, label) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPending({ kind, label, startedAt: Date.now() });
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
    setReshootResult(null);
  }, []);

  // ---------- 规划（W → T） ----------

  const startPlanning = useCallback(async ({
    mode,
    dishName,
    feedbackType = null,
    alternative = false,
    cartItems = [],
    acquiredItems = [],
    inventorySnapshot = inventory,
    inventoryModeSnapshot = inventoryMode,
    timeBudgetIdSnapshot = timeBudgetId,
    noteSnapshot = note,
    inputProvenance = null,
  }) => {
    const baseInventory = Array.isArray(inventorySnapshot) ? inventorySnapshot : [];
    const timeBudget = timeOptionById(timeBudgetIdSnapshot);
    const userContext = buildUserContext({ timeBudget, note: noteSnapshot, feedbackType, alternative });
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
    const signal = beginPending("plan", mode === "target" ? "正在看家里够不够做" : "正在按你有的食材想办法");
    setPlanError(null);
    try {
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
          snapshotLabel: versionLabel({ mode: "target", dishName, timeBudget, feedbackType, cartItems: simulated, acquiredItems: realAcquired }),
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
          },
        });
      } else {
        const data = await api.planDinner({ inventory: planningInventory, userContext }, { signal });
        commitPlan({
          mode: "free",
          plan: normalizeDinnerPlan(data.plan),
          source: data.source || "model",
          snapshotLabel: versionLabel({ mode: "free", timeBudget, feedbackType, cartItems: simulated, acquiredItems: realAcquired }),
          shoppingPreview: null,
          materialState: { acquiredItems: realAcquired, simulatedItems: [] },
          inputProvenance: provenance,
          requestSnapshot: {
            timeBudgetId: timeBudgetIdSnapshot,
            availableCookingTime: timeBudget?.value || "由用户确认",
            inventory: baseInventory,
            inventoryCount: baseInventory.length,
            inventoryMode: inventoryModeSnapshot,
            note: noteSnapshot,
          },
        });
      }
      setScene("ticket");
    } catch (error) {
      if (signal.aborted) return; // 用户主动取消：静默返回
      if (plans.length === 0) {
        setPlanError({ message: error.message || "规划失败", mode, dishName });
        setScene("ticket");
      } else {
        showNotice("这次重新规划失败了，当前方案仍保留");
      }
    } finally {
      endPending();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeBudgetId, note, inventory, inventoryMode, dish, fridge, plans.length]);

  function versionLabel({ mode, dishName, timeBudget, feedbackType, cartItems, acquiredItems }) {
    const parts = [mode === "target" ? `目标菜 · ${dishName}` : "按库存安排"];
    if (timeBudget) parts.push(timeBudget.label);
    const fb = feedbackOptionByType(feedbackType);
    if (fb && !fb.recordOnly) parts.push(`反馈：${fb.label}`);
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

  const useRulesFallback = useCallback(() => {
    const timeBudget = timeOptionById(timeBudgetId);
    const mode = planError?.mode || (intent?.type === "target_dish" ? "target" : "free");
    commitPlan({
      mode,
      plan: mode === "target"
        ? fallbackTargetPlan(planError?.dishName || intent?.dishName, inventory, timeBudget)
        : fallbackDinnerPlan(inventory, timeBudget),
      source: "rules-fallback",
      snapshotLabel: "规则兜底（非本次模型结果）",
      shoppingPreview: null,
      materialState: { acquiredItems: [], simulatedItems: [] },
      inputProvenance: {
        dishImageSource: dish?.imageSource || null,
        dishAnalysisSource: dish?.analysisSource || null,
        fridgeImageSource: fridge?.imageSource || null,
        fridgeAnalysisSource: fridge?.visionSource || null,
        inventoryMode,
      },
      requestSnapshot: {
        timeBudgetId,
        availableCookingTime: timeBudget?.value || "由用户确认",
        inventory,
        inventoryCount: inventory.length,
        inventoryMode,
        note,
      },
    });
    setPlanError(null);
    setScene("ticket");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planError, intent, inventory, inventoryMode, timeBudgetId, note, dish, fridge]);

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
    });
  }, [plans, activePlanId, startPlanning, showNotice, inventory, inventoryMode, timeBudgetId, note]);

  // ---------- 导航 ----------

  const restart = useCallback(() => {
    abortRef.current?.abort();
    clearSessionState();
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
            onFeedback={applyFeedback}
            onCartReplan={applyCartReplan}
            onGotIt={applyGotIt}
            onAddTarget={(dishName) => startPlanning({
              mode: "target",
              dishName,
              inventorySnapshot: activePlan.requestSnapshot?.inventory || inventory,
              inventoryModeSnapshot: activePlan.requestSnapshot?.inventoryMode || inventoryMode,
              timeBudgetIdSnapshot: activePlan.requestSnapshot?.timeBudgetId || timeBudgetId,
              noteSnapshot: activePlan.requestSnapshot?.note ?? note,
              acquiredItems: activePlan.materialState?.acquiredItems || [],
              inputProvenance: activePlan.inputProvenance,
            })}
            onEditFridge={() => setScene("fridge")}
            onRestart={restart}
          />
        )}
        {scene === "ticket" && !activePlan && planError && (
          <section className="tn-scene" aria-label="规划失败">
            <div className="tn-failbox">
              <p className="tn-failbox-title">这次没有生成方案</p>
              <p className="tn-failbox-detail">{planError.message}</p>
              <div className="tn-failbox-actions">
                <button type="button" className="tn-btn tn-btn-primary" onClick={() => startPlanning({ mode: planError.mode, dishName: planError.dishName })}>重试一次</button>
                <button type="button" className="tn-btn tn-btn-quiet" onClick={useRulesFallback}>先看一版保守方案（规则兜底，非本次模型结果）</button>
                <button type="button" className="tn-link" onClick={() => { setPlanError(null); setScene("fridge"); }}>回去改条件</button>
              </div>
            </div>
          </section>
        )}
        {interrupted && (
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
