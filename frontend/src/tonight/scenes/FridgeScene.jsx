import { useEffect, useMemo, useRef, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { SourceBadge, TimeBudgetPicker, UnsurePanel } from "../bits";
import { imageSourceLabel, itemDisplayName, loadInventorySnapshot, namesMatch, snapshotAgeLabel } from "../model";

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
  route, dishName, dishAnalysis, fridge, fixedDemo,
  inventory, inventoryMode, inventoryConfirmed, eatFirstMarks, onToggleEatFirst,
  timeBudgetId, setTimeBudgetId, note, setNote,
  reshootResult, onCapture, onSampleFridge, onUseLast, onReshoot,
  onClearReshoot, onResetCapture, onConfirmInventory, onBenchConfirm, onBack,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const isFeed = route === "feed";
  const steps = isFeed ? ["这道菜", "现实", "决定"] : ["冰箱", "盘点", "决定"];

  const [step, setStep] = useState(() => (inventoryConfirmed || fridge?.vision || inventory.length ? "confirm" : "capture"));
  const [excluded, setExcluded] = useState([]);
  const [manualAdds, setManualAdds] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [addingName, setAddingName] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [emptyDeclared, setEmptyDeclared] = useState(false);
  const [benchDish, setBenchDish] = useState("");
  const [eatFirstOpen, setEatFirstOpen] = useState(false);

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
    setOverrides({});
  }, [inventoryConfirmed]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  const includedNames = useMemo(() => {
    const names = [
      ...baseItems.map(itemDisplayName).filter((n) => n && !excluded.includes(n)),
      ...manualAdds,
    ];
    return [...new Set(names)];
  }, [baseItems, excluded, manualAdds]);
  const standaloneManualAdds = useMemo(
    () => manualAdds.filter((name) => !baseItems.some((item) => !excluded.includes(itemDisplayName(item)) && namesMatch(name, itemDisplayName(item)))),
    [manualAdds, baseItems, excluded],
  );

  // Feed 对照：目标菜关键材料 vs 已确认库存
  const needNames = useMemo(() => {
    if (!isFeed) return [];
    const raw = dishAnalysis?.likelyIngredients;
    if (!Array.isArray(raw)) return [];
    return raw.map(itemDisplayName).filter(Boolean).slice(0, 8);
  }, [isFeed, dishAnalysis]);

  function needStatus(name) {
    const forced = overrides[name];
    if (forced) return forced;
    return includedNames.some((held) => namesMatch(held, name)) ? "have" : "missing";
  }

  function addManual(name) {
    const clean = String(name || "").trim();
    if (!clean) return;
    setManualAdds((cur) => (cur.includes(clean) ? cur : [...cur, clean]));
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
    const fromOverrides = needNames
      .filter((name) => overrides[name] === "have" && !includedNames.some((held) => namesMatch(held, name)))
      .map((name) => ({ name, category: "", quantityEstimate: "", state: "用户确认家里有", notes: "" }));
    const explicitlyMissing = Object.entries(overrides)
      .filter(([, value]) => value === "missing")
      .map(([name]) => name);
    const withoutMissing = [...fromVision, ...fromManual, ...fromOverrides]
      .filter((item) => !explicitlyMissing.some((name) => namesMatch(name, item.name)));
    const seen = new Set();
    return withoutMissing.filter((item) => {
      if (!item.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  }

  // 有效确认库存：排除、手动添加与对照 overrides 全部应用后的结果；
  // 先吃列表、计数与摘要统一以此为准
  const effectiveItems = useMemo(
    () => confirmedItems(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseItems, excluded, standaloneManualAdds, needNames, overrides, includedNames],
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
    setEmptyDeclared(false);
    setExcluded([]);
    setManualAdds([]);
    setOverrides({});
    onClearReshoot();
    onCapture(file, event.target.dataset.source || "album");
  }

  function resetToCapture() {
    onResetCapture();
    setStep("capture");
    setManualMode(false);
    setEmptyDeclared(false);
    setExcluded([]);
    setManualAdds([]);
    setOverrides({});
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
          <div className="tn-field">
            <p className="tn-field-label">可选：我也有想吃的菜</p>
            <div className="tn-note">
              <input
                className="tn-note-input"
                value={benchDish}
                onChange={(e) => setBenchDish(e.target.value)}
                placeholder="输入菜名，比如 番茄牛腩"
                aria-label="想吃的菜（可选）"
              />
              <SpeechInput onTranscript={(text) => setBenchDish(text)} />
            </div>
          </div>

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
          {benchDishName ? (
            <button
              type="button"
              className="tn-btn tn-btn-primary tn-btn-xl"
              disabled={!canPlan}
              onClick={() => onBenchConfirm({ intentType: "target_dish", dishName: benchDishName, timeId: timeBudgetId, note })}
            >
              看看家里够不够做「{benchDishName}」
            </button>
          ) : (
            <button
              type="button"
              className="tn-btn tn-btn-primary tn-btn-xl"
              disabled={!canPlan}
              onClick={() => onBenchConfirm({ intentType: "inventory_driven", timeId: timeBudgetId, note })}
            >
              按现有库存帮我决定
            </button>
          )}
          {!canPlan && <p className="tn-foot-hint">先选一下今晚愿意留多久</p>}
        </footer>
      </section>
    );
  }

  // ---------- 确认（对照 / 盘点 / 手动 / 上次库存） ----------

  const noRecognized = fridge?.status === "ok" && fridge?.vision && visionItems.length === 0 && !manualMode && !inventoryConfirmed && effectiveNames.length === 0;

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

      {noRecognized && !emptyDeclared && (
        <div className="tn-failbox">
          <p className="tn-failbox-title">没有认出可以确认的食材</p>
          <p className="tn-failbox-detail">可能是画面里确实没有可用食材，也可能是没拍清。你可以重拍，或明确确认当前没有可用食材。</p>
          <div className="tn-failbox-actions">
            <button type="button" className="tn-btn tn-btn-quiet" onClick={resetToCapture}>重拍一张</button>
            <button type="button" className="tn-btn tn-btn-quiet" onClick={() => setEmptyDeclared(true)}>我确认冰箱现在没有可用食材</button>
          </div>
        </div>
      )}

      {isFeed && needNames.length > 0 && !manualMode && (
        <div className="tn-compare" aria-label="这道菜需要 vs 冰箱里看到的">
          <p className="tn-compare-title">做「{dishName}」，对一遍</p>
          <ul className="tn-compare-list">
            {needNames.map((name) => {
              const st = needStatus(name);
              return (
                <li key={name} className={`tn-need is-${st}`}>
                  <span className="tn-need-mark" aria-hidden="true">{st === "have" ? "✓" : "✗"}</span>
                  <span className="tn-need-name">{name}</span>
                  <button
                    type="button"
                    className="tn-need-toggle"
                    onClick={() => setOverrides((cur) => ({ ...cur, [name]: st === "have" ? "missing" : "have" }))}
                  >
                    {st === "have" ? "其实没有" : "其实有"}
                  </button>
                  <span className="tn-sronly">{st === "have" ? "家里有" : "没看到"}</span>
                </li>
              );
            })}
          </ul>
          <p className="tn-compare-note">冰箱里没看到不代表家里一定没有；盐、油、酱油等常备调味会在行动单里请你确认。</p>
        </div>
      )}

      {!noRecognized && (
        <div className="tn-field">
          <p className="tn-field-label">
            {isFeed ? "冰箱还看到（点掉家里没有的）" : "确认你家里有的（点掉不对的）"}
          </p>
          <div className="tn-chips">
            {baseItems.map((item) => {
              const name = itemDisplayName(item);
              const off = excluded.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={!off}
                  className={`tn-chip ${off ? "" : "is-on"}`}
                  onClick={() => setExcluded((cur) => (off ? cur.filter((n) => n !== name) : [...cur, name]))}
                >
                  {name}
                  {item?.quantityEstimate ? <small>{item.quantityEstimate}</small> : null}
                </button>
              );
            })}
            {standaloneManualAdds.map((name) => (
              <button key={name} type="button" className="tn-chip is-on" onClick={() => setManualAdds((cur) => cur.filter((x) => x !== name))}>
                {name}<small>手动加的 · 点按移除</small>
              </button>
            ))}
          </div>
          <div className="tn-addrow">
            <input
              className="tn-note-input"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              placeholder="还有没认出来的？手动加上"
              aria-label="手动添加食材"
              onKeyDown={(e) => { if (e.key === "Enter") addManual(addingName); }}
            />
            <SpeechInput onTranscript={(text) => setAddingName(text)} />
            <button type="button" className="tn-btn tn-btn-quiet" onClick={() => addManual(addingName)}>加上</button>
          </div>
        </div>
      )}

      {!noRecognized && effectiveNames.length > 0 && (
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

      {!manualMode && fridge?.vision?.uncertainItems?.length > 0 && (
        <UnsurePanel
          items={fridge.vision.uncertainItems}
          onAddNamed={addManual}
          onReshoot={onReshoot}
          reshootResult={reshootResult}
          onClearReshoot={onClearReshoot}
        />
      )}

      {fridge?.vision?.warnings?.[0] && <p className="tn-warning" role="note">{fridge.vision.warnings[0]}</p>}
      <p className="tn-warning" role="note">新鲜度、保质期和肉类状态以你自己检查为准，AI 不凭照片判断。</p>

      <footer className="tn-scene-foot">
        {emptyDeclared || effectiveNames.length === 0 ? (
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
            {isFeed ? "库存确认了，给我今晚的决定" : `确认库存（${effectiveNames.length} 样），下一步`}
          </button>
        )}
      </footer>

      <input ref={cameraRef} data-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} data-source="album" type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
