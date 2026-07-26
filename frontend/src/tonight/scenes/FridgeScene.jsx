import { useEffect, useMemo, useRef, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { SourceBadge, TimeBudgetPicker, UnsurePanel } from "../bits";
import { imageSourceLabel, ingredientNamesMatch, itemDisplayName, loadInventorySnapshot, snapshotAgeLabel } from "../model";

function Dots({ steps, current }) {
  return (
    <ol className="tn-dots" aria-label="进度">
      {steps.map((label, i) => (
        <li key={label} className={i === current ? "is-now" : i < current ? "is-done" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="tn-dots-dot" aria-hidden="true" />
          <span className="tn-dots-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function FridgeScene({
  route, dishName, dishNameSource, dishImageSource, selectedDishOption, fridge, fixedDemo,
  inventory, inventoryMode, inventoryConfirmed, eatFirstMarks, onToggleEatFirst,
  timeBudgetId, setTimeBudgetId, note, setNote,
  benchDraft, onBenchDraftChange, onTargetDishImage, targetDishBusy = false,
  reshootResult, reshootBusyId, onCapture, onSampleFridge, onUseLast, onReshoot,
  onClearReshoot, onResetCapture, onConfirmInventory, onBenchConfirm, onBack,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const targetCameraRef = useRef(null);
  const targetAlbumRef = useRef(null);
  const supplementRef = useRef(null);
  const isFeed = route === "feed";
  const steps = isFeed ? ["这道菜", "盘点", "决定"] : ["冰箱", "盘点", "决定"];
  const inventorySupplementKey = "inventory-supplement";

  // 冰箱路线确认完库存后，组件即使因共享菜图候选子流程而重新挂载，
  // 也必须回到 R3，而不是把用户退回库存确认页。
  const [step, setStep] = useState(() => {
    if (!isFeed && inventoryConfirmed) return "bench";
    return inventoryConfirmed || fridge?.vision || inventory.length ? "confirm" : "capture";
  });
  const [excluded, setExcluded] = useState([]);
  const [manualAdds, setManualAdds] = useState([]);
  const [addingName, setAddingName] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [benchIntent, setBenchIntent] = useState(() => (
    isFeed ? "inventory_driven" : benchDraft?.intentType || (dishName ? "target_dish" : "inventory_driven")
  ));
  const [benchDish, setBenchDish] = useState(() => (
    isFeed ? "" : String(benchDraft?.dishName ?? dishName ?? "")
  ));
  const [benchDishSource, setBenchDishSource] = useState(() => (
    isFeed ? "user_text" : benchDraft?.dishNameSource || dishNameSource || "user_text"
  ));
  const [eatFirstOpen, setEatFirstOpen] = useState(false);
  const [expandedInventoryNames, setExpandedInventoryNames] = useState({});

  const visionItems = useMemo(() => (fridge?.vision?.items || []), [fridge]);
  const baseItems = useMemo(
    () => (inventoryConfirmed || (inventoryMode === "last" && !fridge?.vision) ? inventory : visionItems),
    [inventoryConfirmed, inventoryMode, fridge, inventory, visionItems],
  );

  // 识别完成且有效后自动进入确认步骤（失败三态停留在拍摄步骤展示横幅）
  useEffect(() => {
    if (fridge?.vision && fridge?.status === "ok" && step === "capture" && !manualMode) setStep("confirm");
  }, [fridge, step, manualMode]);

  useEffect(() => {
    if (inventoryMode === "last" && !fridge && step === "capture") setStep("confirm");
  }, [inventoryMode, fridge, step]);

  useEffect(() => {
    if (!inventoryConfirmed) return;
    setExcluded([]);
    setManualAdds([]);
  }, [inventoryConfirmed]);

  useEffect(() => {
    setExpandedInventoryNames({});
  }, [baseItems, manualAdds]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  // benchDraft 是 R3 的可选受控快照。主状态机在进入菜图候选子流程前保存它，
  // 确认候选或取消后再传回来，因此文字、意图与来源都不会因组件卸载丢失。
  useEffect(() => {
    if (isFeed || !benchDraft) return;
    const nextIntent = benchDraft.intentType === "target_dish" ? "target_dish" : "inventory_driven";
    setBenchIntent(nextIntent);
    setBenchDish(String(benchDraft.dishName || ""));
    setBenchDishSource(benchDraft.dishNameSource || "user_text");
  }, [isFeed, benchDraft?.intentType, benchDraft?.dishName, benchDraft?.dishNameSource]);

  const includedNames = useMemo(() => {
    const names = [
      ...baseItems.map(itemDisplayName).filter((n) => n && !excluded.includes(n)),
      ...manualAdds,
    ];
    return [...new Set(names)];
  }, [baseItems, excluded, manualAdds]);
  const standaloneManualAdds = useMemo(
    () => manualAdds.filter((name) => !baseItems.some((item) => !excluded.includes(itemDisplayName(item)) && ingredientNamesMatch(name, itemDisplayName(item)))),
    [manualAdds, baseItems, excluded],
  );

  function manualNamesFromText(text) {
    return String(text || "")
      .split(/[\s,，、;；]+/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function addManual(text) {
    const names = manualNamesFromText(text);
    if (!names.length) return;
    setManualAdds((cur) => {
      const next = [...cur];
      names.forEach((name) => {
        const alreadyIncluded = includedNames.some((held) => ingredientNamesMatch(held, name));
        const alreadyManual = next.some((held) => ingredientNamesMatch(held, name));
        if (!alreadyIncluded && !alreadyManual) next.push(name);
      });
      return next;
    });
    setAddingName("");
  }

  function confirmedItems() {
    const fromVision = baseItems
      .filter((item) => !excluded.includes(itemDisplayName(item)))
      .map((item) => ({
        name: itemDisplayName(item),
        category: String(item?.category || "").trim(),
        quantityEstimate: String(item?.quantityEstimate || "").trim(),
        state: String(item?.state || "用户确认可用").trim(),
        notes: String(item?.notes || "").trim(),
      }));
    const fromManual = standaloneManualAdds.map((name) => ({ name, category: "", quantityEstimate: "", state: "用户手动确认", notes: "" }));
    const seen = new Set();
    return [...fromVision, ...fromManual].filter((item) => {
      if (!item.name) return false;
      const key = item.name.toLocaleLowerCase("zh-CN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 有效确认库存：排除、手动添加与对照 overrides 全部应用后的结果；
  // 先吃列表、计数与摘要统一以此为准
  const effectiveItems = useMemo(
    () => confirmedItems(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseItems, excluded, standaloneManualAdds],
  );
  const effectiveNames = useMemo(() => effectiveItems.map((item) => item.name), [effectiveItems]);
  const markedNames = useMemo(
    () => effectiveNames.filter((name) => {
      const mark = eatFirstMarks?.[name];
      return mark && (mark.opened || mark.labelSoon || mark.unsure);
    }),
    [effectiveNames, eatFirstMarks],
  );

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setManualMode(false);
    setExcluded([]);
    setManualAdds([]);
    onClearReshoot();
    onCapture(file, event.target.dataset.source || "album");
  }

  function resetToCapture() {
    onResetCapture();
    setStep("capture");
    setManualMode(false);
    setExcluded([]);
    setManualAdds([]);
  }

  function handleSupplementFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onClearReshoot();
    onReshoot(file, inventorySupplementKey);
  }

  function toggleExpandedInventory(key) {
    setExpandedInventoryNames((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  function nextBenchDraft(patch = {}) {
    return {
      intentType: patch.intentType ?? benchIntent,
      dishName: patch.dishName ?? benchDish,
      dishNameSource: patch.dishNameSource ?? benchDishSource,
      dishImageSource: patch.dishImageSource !== undefined
        ? patch.dishImageSource
        : benchDraft?.dishImageSource || dishImageSource || null,
      selectedDishOption: patch.selectedDishOption !== undefined
        ? patch.selectedDishOption
        : benchDraft?.selectedDishOption || selectedDishOption || null,
    };
  }

  function publishBenchDraft(patch = {}) {
    const next = nextBenchDraft(patch);
    onBenchDraftChange?.(next);
    return next;
  }

  function chooseBenchIntent(intentType) {
    setBenchIntent(intentType);
    publishBenchDraft({ intentType });
  }

  function setBenchDishFromUser(text, source) {
    setBenchIntent("target_dish");
    setBenchDish(text);
    setBenchDishSource(source);
    publishBenchDraft({
      intentType: "target_dish",
      dishName: text,
      dishNameSource: source,
      dishImageSource: null,
      selectedDishOption: null,
    });
  }

  function handleTargetDishFile(event) {
    const file = event.target.files?.[0];
    const imageSource = event.target.dataset.source || "album";
    event.target.value = "";
    if (!file) return;
    setBenchIntent("target_dish");
    // 先把 R3 条件交给主状态机，再进入共享菜名候选子流程；这里不修改库存。
    publishBenchDraft({ intentType: "target_dish" });
    onTargetDishImage?.(file, imageSource);
  }

  function targetSourceLabel(source, imageSource = null) {
    if (source === "user_voice" || source === "fridge_voice") return "语音确认";
    if (source === "user_text" || source === "fridge_text") return "文字确认";
    if (imageSource === "sample") return "示例菜图候选";
    if (imageSource === "camera") return "实拍菜图候选";
    if (imageSource === "album") return "相册菜图候选";
    if (String(source || "").startsWith("vision_")) return "菜图候选已确认";
    return "已确认目标菜";
  }

  function isVisionConfirmedSource(source) {
    const value = String(source || "");
    return value.startsWith("vision_") || value === "image_candidate" || value === "image_option";
  }

  const status = fridge?.status || "";
  const snapshot = loadInventorySnapshot();

  // ---------- 失败三态横幅 ----------

  function FailureBanner() {
    if (status === "not_fridge") {
      return (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">这看起来不像是冰箱内部</p>
          <p className="tn-failbox-detail">换一张正对冰箱内部的照片，或者改用其他方式。</p>
          <FailureActions />
        </div>
      );
    }
    if (status === "unusable") {
      return (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">画面太模糊或遮挡严重，无法判断</p>
          <p className="tn-failbox-detail">补一张光线好一点、能看清层架的照片。</p>
          <FailureActions />
        </div>
      );
    }
    if (status === "failed") {
      return (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">这次识别没有完成</p>
          <p className="tn-failbox-detail">网络或模型暂时不可用，识别已停止，不会用空库存冒充结果。</p>
          <FailureActions />
        </div>
      );
    }
    if (status === "unknown") {
      return (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">这张图还不能作为冰箱库存依据</p>
          <p className="tn-failbox-detail">画面类型没有可靠确认；请重拍、手动填写，或重新核对上次库存。</p>
          <FailureActions />
        </div>
      );
    }
    return null;
  }

  function FailureActions() {
    return (
      <div className="tn-failbox-actions">
        <button type="button" className="tn-btn tn-btn-quiet" onClick={() => cameraRef.current?.click()}>重新拍摄</button>
        <button type="button" className="tn-btn tn-btn-quiet" onClick={() => albumRef.current?.click()}>更换图片</button>
        <button type="button" className="tn-btn tn-btn-quiet" onClick={() => { setManualMode(true); setStep("confirm"); }}>手动填写</button>
        {snapshot && (
          <button type="button" className="tn-btn tn-btn-quiet" onClick={onUseLast}>
            用上次库存（{snapshotAgeLabel(snapshot.confirmedAt)}）重新核对
          </button>
        )}
      </div>
    );
  }

  // ---------- 尚未拍摄 ----------

  if (step === "capture") {
    return (
      <section className="tn-scene tn-fridge" aria-label="拍冰箱">
        <header className="tn-scene-head">
          <button type="button" className="tn-back" onClick={onBack} aria-label="返回">‹</button>
          <Dots steps={steps} current={isFeed ? 1 : 0} />
        </header>

        <FailureBanner />

        <div className="tn-fridge-empty">
          <p className="tn-fridge-ask">{isFeed ? "再看看家里的现实" : "打开冰箱，拍一张"}</p>
          <p className="tn-fridge-sub">不用收拾，原样拍就行。AI 看完会请你逐项确认，看不清的不会替你猜。</p>
          <div className="tn-fridge-capture">
            <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={() => cameraRef.current?.click()}>
              拍冰箱
            </button>
            <div className="tn-feed-alt">
              <button type="button" className="tn-btn tn-btn-quiet" onClick={() => albumRef.current?.click()}>从相册选</button>
              <button type="button" className="tn-btn tn-btn-quiet" onClick={onSampleFridge}>用示例冰箱</button>
            </div>
            {snapshot && (
              <button type="button" className="tn-link" onClick={onUseLast}>
                用上次确认的库存（{snapshotAgeLabel(snapshot.confirmedAt)}）重新核对——不代表这些食材现在仍在
              </button>
            )}
          </div>
        </div>

        <input ref={cameraRef} data-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
        <input ref={albumRef} data-source="album" type="file" accept="image/*" hidden onChange={handleFile} />
      </section>
    );
  }

  // ---------- 规划台（冰箱路线第二步） ----------

  if (step === "bench") {
    const canPlan = Boolean(timeBudgetId);
    const benchDishName = benchDish.trim();
    const wantsTargetDish = benchIntent === "target_dish";
    const visionDishLocked = wantsTargetDish && benchDishName && isVisionConfirmedSource(benchDishSource);
    const benchSelectedOption = benchDraft?.selectedDishOption || selectedDishOption || null;
    const benchDishImageSource = benchDraft?.dishImageSource || dishImageSource || null;
    return (
      <section className="tn-scene tn-bench" aria-label="规划台">
        <header className="tn-scene-head">
          <button type="button" className="tn-back" onClick={() => setStep("confirm")} aria-label="返回库存确认">‹</button>
          <Dots steps={steps} current={1} />
        </header>

        <div className="tn-bench-summary">
          <p className="tn-field-label">已确认 {inventory.length} 样</p>
          <div className="tn-chips">
            {inventory.slice(0, 10).map((item) => (
              <span key={itemDisplayName(item)} className="tn-chip is-on">{itemDisplayName(item)}</span>
            ))}
            {inventory.length === 0 && <span className="tn-chip">空库存（你已确认）</span>}
          </div>
          <button type="button" className="tn-link" onClick={() => setStep("confirm")}>回去改库存</button>
        </div>

        <div className="tn-bench-intent">
          <p className="tn-bench-ask">接下来怎么定？</p>
          <div className="tn-dish-choicegrid tn-bench-modegrid" role="radiogroup" aria-label="规划方式">
            <button
              type="button"
              role="radio"
              aria-checked={!wantsTargetDish}
              className={`tn-dish-choice ${!wantsTargetDish ? "is-on" : ""}`}
              onClick={() => chooseBenchIntent("inventory_driven")}
            >
              <small>不指定菜</small>
              <strong>按现有库存帮我决定</strong>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={wantsTargetDish}
              className={`tn-dish-choice ${wantsTargetDish ? "is-on" : ""}`}
              onClick={() => chooseBenchIntent("target_dish")}
            >
              <small>可选</small>
              <strong>我有想吃的菜</strong>
            </button>
          </div>

          {wantsTargetDish && (
            <div className="tn-bench-target tn-bench-intent" aria-label="目标菜输入">
              {visionDishLocked ? (
                <div className="tn-warning tn-bench-target-source" role="note">
                  <span>已从菜图候选确认「{benchDishName}」</span>
                  <span className="tn-chip tn-chip-mini is-on">{targetSourceLabel(benchDishSource, benchDishImageSource)}</span>
                  <button
                    type="button"
                    className="tn-link"
                    onClick={() => setBenchDishFromUser("", "user_text")}
                  >
                    改用文字或语音
                  </button>
                </div>
              ) : (
                <div className="tn-field">
                  <p className="tn-field-label">文字或语音</p>
                  <div className="tn-note">
                    <input
                      className="tn-note-input"
                      value={benchDish}
                      onChange={(event) => setBenchDishFromUser(event.target.value, "user_text")}
                      placeholder="输入菜名，比如 番茄牛腩"
                      aria-label="想吃的菜"
                      maxLength={40}
                    />
                    <SpeechInput onTranscript={(text) => setBenchDishFromUser(text, "user_voice")} />
                  </div>
                  {benchDishName && (
                    <p className="tn-prototype-note">{targetSourceLabel(benchDishSource, benchDishImageSource)}：后续仍会经过目标语义判断。</p>
                  )}
                </div>
              )}

              <div className="tn-field tn-bench-image-input">
                <p className="tn-field-label">或者提供目标菜图片</p>
                <div className="tn-feed-alt tn-bench-image-actions">
                  <button
                    type="button"
                    className="tn-btn tn-btn-quiet"
                    disabled={targetDishBusy}
                    onClick={() => targetCameraRef.current?.click()}
                  >
                    {targetDishBusy ? "正在识别菜图…" : "拍目标菜"}
                  </button>
                  <button
                    type="button"
                    className="tn-btn tn-btn-quiet"
                    disabled={targetDishBusy}
                    onClick={() => targetAlbumRef.current?.click()}
                  >
                    从相册选目标菜
                  </button>
                </div>
                <p className="tn-prototype-note">图片会进入同一套菜名候选确认；取消后仍回到这里，已确认库存不会清空。</p>
              </div>
            </div>
          )}

          <TimeBudgetPicker value={timeBudgetId} onChange={setTimeBudgetId} />

          <div className="tn-field">
            <p className="tn-field-label">还有什么要求？（可选）</p>
            <input
              className="tn-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如：少油、想吃点热乎的"
              aria-label="补充要求"
            />
          </div>
        </div>

        <footer className="tn-scene-foot">
          {wantsTargetDish ? (
            <button
              type="button"
              className="tn-btn tn-btn-primary tn-btn-xl"
              disabled={!canPlan || !benchDishName}
              onClick={() => {
                const next = publishBenchDraft({ intentType: "target_dish" });
                onBenchConfirm({
                  intentType: "target_dish",
                  dishName: benchDishName,
                  dishNameSource: benchDishSource,
                  selectedDishOption: isVisionConfirmedSource(benchDishSource) ? benchSelectedOption : null,
                  timeId: timeBudgetId,
                  note,
                  benchDraft: next,
                });
              }}
            >
              {benchDishName ? `看看家里够不够做「${benchDishName}」` : "先确认想吃的菜"}
            </button>
          ) : (
            <button
              type="button"
              className="tn-btn tn-btn-primary tn-btn-xl"
              disabled={!canPlan}
              onClick={() => {
                const next = publishBenchDraft({ intentType: "inventory_driven" });
                onBenchConfirm({ intentType: "inventory_driven", timeId: timeBudgetId, note, benchDraft: next });
              }}
            >
              按现有库存帮我决定
            </button>
          )}
          {!canPlan && <p className="tn-foot-hint">先选一下今晚愿意留多久</p>}
          {canPlan && wantsTargetDish && !benchDishName && (
            <p className="tn-foot-hint">用文字、语音、拍照或相册先确认一道目标菜</p>
          )}
        </footer>

        <input
          ref={targetCameraRef}
          data-source="camera"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleTargetDishFile}
        />
        <input
          ref={targetAlbumRef}
          data-source="album"
          type="file"
          accept="image/*"
          hidden
          onChange={handleTargetDishFile}
        />
      </section>
    );
  }

  // ---------- 确认（Feed 盘点 / 冰箱路线盘点 / 手动 / 上次库存） ----------

  const noRecognized = fridge?.status === "ok" && fridge?.vision && visionItems.length === 0 && !manualMode && !inventoryConfirmed && effectiveNames.length === 0;
  const inventoryGridBlock = !noRecognized ? (
    <div className="tn-field tn-inventory-materials">
      <p className="tn-field-label">确认你家里有的（点掉不对的）</p>
      <ul className="tn-inventory-material-list">
        {baseItems.map((item, index) => {
          const name = itemDisplayName(item);
          const off = excluded.includes(name);
          const key = `base-${name}-${index}`;
          const expanded = Boolean(expandedInventoryNames[key]);
          return (
            <li key={key} className={`${expanded ? "is-expanded" : ""} ${off ? "is-off" : ""}`}>
              <button
                type="button"
                className="tn-inventory-material-name"
                title={name}
                aria-expanded={expanded}
                onClick={() => toggleExpandedInventory(key)}
              >
                <span>{name}</span>
              </button>
              <button
                type="button"
                className="tn-inventory-state"
                aria-label={off ? `恢复${name}` : `移除${name}`}
                aria-pressed={!off}
                onClick={() => setExcluded((cur) => (off ? cur.filter((n) => n !== name) : [...cur, name]))}
              >
                {off ? "×" : "✓"}
              </button>
            </li>
          );
        })}
        {standaloneManualAdds.map((name, index) => {
          const key = `manual-${name}-${index}`;
          const expanded = Boolean(expandedInventoryNames[key]);
          return (
            <li key={key} className={expanded ? "is-expanded" : ""}>
              <button
                type="button"
                className="tn-inventory-material-name"
                title={name}
                aria-expanded={expanded}
                onClick={() => toggleExpandedInventory(key)}
              >
                <span>{name}</span>
              </button>
              <button
                type="button"
                className="tn-inventory-state"
                aria-label={`移除${name}`}
                aria-pressed="true"
                onClick={() => setManualAdds((cur) => cur.filter((x) => x !== name))}
              >
                ✓
              </button>
            </li>
          );
        })}
      </ul>
      {baseItems.length === 0 && standaloneManualAdds.length === 0 && (
        <p className="tn-feed-inventory-empty">还没有确认的食材，可以在下面补充。</p>
      )}
    </div>
  ) : null;

  const inventorySupplementResult = reshootResult?.key === inventorySupplementKey ? reshootResult : null;
  const inventorySupplementBlock = !noRecognized ? (
    <div className="tn-feed-supplement">
      <div className="tn-feed-supplement-head">
        <p className="tn-feed-supplement-title">补充没看清的食材</p>
        <p>透明袋、抽屉盒装食材和包装食品可能漏掉；可以补拍，也可以一次输入多个。</p>
      </div>
      <div className="tn-feed-supplement-actions">
        <button
          type="button"
          className="tn-supplement-photo"
          disabled={reshootBusyId === inventorySupplementKey}
          onClick={() => supplementRef.current?.click()}
        >
          {reshootBusyId === inventorySupplementKey ? "识别中…" : "补拍"}
        </button>
        <div className="tn-addrow">
          <div className="tn-note tn-inline-speech tn-addrow-entry">
            <input
              className="tn-note-input"
              value={addingName}
              onChange={(event) => setAddingName(event.target.value)}
              placeholder="可一次输入多个：鸡蛋 土豆 青椒"
              aria-label="批量补充食材"
              onKeyDown={(event) => { if (event.key === "Enter") addManual(addingName); }}
            />
            <SpeechInput
              iconOnly
              className="tn-inline-speech-btn"
              onTranscript={(text) => setAddingName((cur) => (cur ? `${cur} ${text}` : text))}
            />
          </div>
          <button type="button" className="tn-btn tn-btn-quiet" onClick={() => addManual(addingName)}>加入库存</button>
        </div>
      </div>
      {inventorySupplementResult && (
        <div className="tn-reshoot">
          {inventorySupplementResult.items.length > 0 ? (
            <>
              <p className="tn-unsure-lead">局部图里看到了这些候选；点一下确认，才会加入库存：</p>
              <div className="tn-chips">
                {inventorySupplementResult.items.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="tn-chip"
                    onClick={() => {
                      addManual(name);
                      onClearReshoot();
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="tn-unsure-lead">这张局部图还是没看清。可以换个角度补拍，或直接输入食材名。</p>
          )}
        </div>
      )}
      <input
        ref={supplementRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleSupplementFile}
      />
    </div>
  ) : null;

  return (
    <section className="tn-scene tn-fridge" aria-label="确认库存">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={isFeed ? onBack : resetToCapture} aria-label="返回">‹</button>
        <Dots steps={steps} current={1} />
      </header>

      {fridge?.image && (
        <div className="tn-fridge-media">
          <img src={fridge.image} alt="冰箱内部照片" />
          <SourceBadge label={imageSourceLabel(fridge.imageSource)} tone={fridge.imageSource === "sample" ? "sample" : "real"} />
          {fixedDemo && <span className="tn-badge tn-badge-fixed">固定示例结果</span>}
          <button type="button" className="tn-btn tn-btn-glass tn-fridge-rebtn" onClick={resetToCapture}>重拍</button>
        </div>
      )}
      {!fridge?.image && inventoryMode === "last" && (
        <p className="tn-warning" role="note">
          这是 {snapshot ? snapshotAgeLabel(snapshot.confirmedAt) : "之前"}确认的库存，不代表这些食材现在仍然存在，请逐项核对。
        </p>
      )}
      {!fridge?.image && inventoryConfirmed && inventoryMode === "vision" && (
        <p className="tn-warning" role="note">原始照片未保存；你确认过的库存仍可继续使用。需要重新识别画面时请重拍。</p>
      )}
      {manualMode && (
        <p className="tn-warning" role="note">手动填写模式：只把你确认家里有的食材加进来。</p>
      )}

      {noRecognized && (
        <div className="tn-failbox">
          <p className="tn-failbox-title">没有认出可以确认的食材</p>
          <p className="tn-failbox-detail">可能是画面里确实没有可用食材，也可能是没拍清。你可以重拍，或明确确认当前没有可用食材。</p>
          <div className="tn-failbox-actions">
            <button type="button" className="tn-btn tn-btn-quiet" onClick={resetToCapture}>重拍一张</button>
            <button
              type="button"
              className="tn-btn tn-btn-quiet"
              onClick={() => {
                onConfirmInventory([], "empty");
                if (!isFeed) setStep("bench");
              }}
            >
              我确认冰箱现在没有可用食材
            </button>
          </div>
        </div>
      )}

      {!noRecognized && (
        <>
          {inventoryGridBlock}
          {inventorySupplementBlock}
        </>
      )}

      {!isFeed && !noRecognized && effectiveNames.length > 0 && (
        <div className="tn-eatfirst">
          <button
            type="button"
            className="tn-eatfirst-toggle"
            aria-expanded={eatFirstOpen}
            onClick={() => setEatFirstOpen((v) => !v)}
          >
            <span>有想先用掉的吗？（可选）</span>
            <span className="tn-eatfirst-summary">
              {markedNames.length > 0
                ? `已标记 ${markedNames.length} 样：${markedNames.slice(0, 3).join("、")}${markedNames.length > 3 ? "…" : ""}`
                : "标一下，今晚优先安排"}
            </span>
          </button>
          {eatFirstOpen && (
            <div className="tn-eatfirst-body">
              <p className="tn-eatfirst-note">只按你确认的状态影响今晚安排；AI 不凭照片判断新鲜度、保质期或是否安全。</p>
              <ul className="tn-eatfirst-list">
                {effectiveNames.map((name) => {
                  const mark = eatFirstMarks?.[name] || {};
                  return (
                    <li key={name} className="tn-eatfirst-row">
                      <span className="tn-eatfirst-name">{name}</span>
                      <span className="tn-eatfirst-opts" role="group" aria-label={`${name}的状态`}>
                        <button
                          type="button"
                          className={`tn-eatfirst-opt ${mark.opened ? "is-on" : ""}`}
                          aria-pressed={Boolean(mark.opened)}
                          onClick={() => onToggleEatFirst(name, "opened")}
                        >
                          已开封
                        </button>
                        <button
                          type="button"
                          className={`tn-eatfirst-opt ${mark.labelSoon ? "is-on" : ""}`}
                          aria-pressed={Boolean(mark.labelSoon)}
                          onClick={() => onToggleEatFirst(name, "labelSoon")}
                        >
                          标签日期临近
                        </button>
                        <button
                          type="button"
                          className={`tn-eatfirst-opt ${mark.unsure ? "is-on" : ""}`}
                          aria-pressed={Boolean(mark.unsure)}
                          onClick={() => onToggleEatFirst(name, "unsure")}
                        >
                          状态不确定
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {!isFeed && !manualMode && fridge?.vision?.uncertainItems?.length > 0 && (
        <UnsurePanel
          items={fridge.vision.uncertainItems}
          onAddNamed={addManual}
          onReshoot={onReshoot}
          reshootBusyId={reshootBusyId}
          reshootResult={reshootResult}
          onClearReshoot={onClearReshoot}
        />
      )}

      {fridge?.vision?.warnings?.[0] && <p className="tn-warning" role="note">{fridge.vision.warnings[0]}</p>}
      <p className="tn-warning" role="note">新鲜度、保质期和肉类状态以你自己检查为准，AI 不凭照片判断。</p>

      <footer className="tn-scene-foot">
        {/* 零识别时唯一的空库存入口在横幅里，底部不再重复提交入口 */}
        {!noRecognized && (effectiveNames.length === 0 ? (
          <button
            type="button"
            className="tn-btn tn-btn-primary tn-btn-xl"
            onClick={() => {
              onConfirmInventory([], "empty");
              if (!isFeed) setStep("bench");
            }}
          >
            我确认冰箱现在没有可用食材，按空库存继续
          </button>
        ) : (
          <button
            type="button"
            className="tn-btn tn-btn-primary tn-btn-xl"
            onClick={() => {
              onConfirmInventory(effectiveItems, manualMode ? "manual" : inventoryMode);
              if (!isFeed) setStep("bench");
            }}
          >
            确认库存（{effectiveNames.length} 样），下一步
          </button>
        ))}
      </footer>

      <input ref={cameraRef} data-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} data-source="album" type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
