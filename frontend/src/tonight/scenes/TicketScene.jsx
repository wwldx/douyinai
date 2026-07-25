import { useEffect, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { VersionStepper } from "../bits";
import BigStepsView from "./BigStepsView";
import { getCookingContext } from "../steps";
import { getTargetExecutionState } from "../targetPlan";
import {
  FEEDBACK_OPTIONS,
  ingredientNamesMatch,
  isFixedDemoResult,
  mergeIngredientNames,
  pantryNamesMatch,
  normalizePantryConfirmation,
  parseMinutes,
  sessionSourceBadge,
} from "../model";

export default function TicketScene({
  plan, plans, onSelectPlan, timeBudget, gotIt, stepPosition, onMarkStep,
  onFeedback, onCartReplan, onGotIt, onPantryReplan, onAlternative, onAddTarget,
  onUseInventoryPlan, onEditFridge, onRestart, onRescue, onLifeLog,
}) {
  const [cartSel, setCartSel] = useState([]);
  const [gotSel, setGotSel] = useState([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetInputSource, setTargetInputSource] = useState("ticket_text");
  const [pantryDraft, setPantryDraft] = useState({});
  const [pantryError, setPantryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bigStepsOpen, setBigStepsOpen] = useState(false);

  useEffect(() => {
    setCartSel([]);
    setGotSel([]);
    setPantryDraft({});
    setPantryError("");
    setFeedbackOpen(false);
    setBigStepsOpen(false);
  }, [plan?.id]);

  if (!plan) return null;
  const isTarget = plan.mode === "target";
  const isRules = plan.source === "rules-fallback";
  const provenance = plan.inputProvenance || {};
  const fixedDemo = isFixedDemoResult(provenance.dishAnalysisSource, provenance.dishImageSource)
    || isFixedDemoResult(provenance.fridgeAnalysisSource, provenance.fridgeImageSource);
  const sessionBadge = sessionSourceBadge([
    provenance.dishImageSource,
    provenance.inventoryMode === "vision" ? provenance.fridgeImageSource : provenance.inventoryMode === "last" ? "last-inventory" : "manual",
  ]);

  const requestedMealName = isTarget
    ? plan.requestSnapshot?.dishName || plan.plan?.targetDish?.name
    : plan.plan?.baseMeal?.name;
  const accepted = mergeIngredientNames(
    plan.materialState?.simulatedItems,
    plan.shoppingPreview?.acceptedItems,
  );
  const eatFirst = plan.requestSnapshot?.eatFirst || null;
  const alternativeFrom = plan.requestSnapshot?.alternativeFrom || null;
  const pantryConfirmation = normalizePantryConfirmation(plan.requestSnapshot?.pantryConfirmation);
  const pantryAvailable = pantryConfirmation.availableItems;
  const pantryMissing = pantryConfirmation.missingItems;
  // 优先用生成时冻结的来源序号；只有旧会话缺字段才回退运行时查找
  const altSourceSeq = alternativeFrom?.sourceSequence
    ?? (alternativeFrom?.sourcePlanId ? plans.find((p) => p.id === alternativeFrom.sourcePlanId)?.sequence : null);

  const modelPantry = isTarget ? [...new Set(plan.plan?.shoppingPlan?.confirmAtHome || [])] : [];
  const pendingPantry = modelPantry.filter((name) => (
    !pantryAvailable.some((item) => pantryNamesMatch(item, name))
    && !pantryMissing.some((item) => pantryNamesMatch(item, name))
  ));
  const missing = isTarget
    ? [...new Set([
      ...(plan.plan?.inventoryMatch?.missingCritical || []),
      ...(plan.plan?.shoppingPlan?.mustBuy || []).map((item) => item.item),
    ])]
    : [];
  const optionalMissing = isTarget ? [...new Set(plan.plan?.inventoryMatch?.missingOptional || [])] : [];
  const materialNames = [...new Set([...missing, ...accepted, ...gotIt])];
  // 有效步骤与「全部缺料已拿到」判断统一来自共享模块，与大字视图、做饭救援同源
  const { steps: displaySteps, allRequiredAcquired } = getCookingContext(plan);
  const executionState = getTargetExecutionState(plan, { allRequiredAcquired, pendingPantry });
  const mealName = executionState.executionDishName || requestedMealName;
  const targetIntentAccepted = !isTarget || executionState.targetStatus === "confirmed_food";
  const targetNeedsCorrection = isTarget && !targetIntentAccepted;
  const canEnterCooking = executionState.canEnterCooking;
  const canShowCookingPreview = targetIntentAccepted && displaySteps.length > 0;
  const targetAssessment = isTarget ? plan.plan?.targetAssessment || {} : {};
  const mustBuyReasons = new Map((plan.plan?.shoppingPlan?.mustBuy || []).map((b) => [b.item, b.reason]));
  const fridgeAvailable = (plan.plan?.inventoryMatch?.availableItems || []).filter(
    (name) => !accepted.some((item) => ingredientNamesMatch(item, name))
      && !gotIt.some((item) => ingredientNamesMatch(item, name))
      && !pantryAvailable.some((item) => pantryNamesMatch(item, name)),
  );
  const pantryDraftCount = Object.values(pantryDraft).filter((status) => status === "available" || status === "missing").length;

  const cookTimeText = isTarget ? plan.plan?.targetDish?.estimatedTime : plan.plan?.baseMeal?.timeCost;
  const cleanCookTimeText = String(cookTimeText || "")
    .replace(/[（(][^）)]*补购[^）)]*[）)]/g, "")
    .trim();
  const cookTimeLabel = cleanCookTimeText
    ? /^约/.test(cleanCookTimeText) ? `做饭${cleanCookTimeText}` : `做饭约 ${cleanCookTimeText}`
    : "";
  const cookMinutes = parseMinutes(cookTimeText);
  const overBudget = Boolean(timeBudget?.minutes && cookMinutes && cookMinutes > timeBudget.minutes);
  const rawTips = isTarget ? plan.plan?.executionPlan?.difficultyWarnings || [] : plan.plan?.baseMeal?.safetyTips || [];
  const displayTips = rawTips
    .filter((tip) => !(allRequiredAcquired && /补购或配送时间/.test(String(tip))))
    .map((tip) => allRequiredAcquired
      ? String(tip).replace(/前提是买/g, "前提是使用本次已拿到的").replace(/补购后/g, "材料确认后")
      : tip);
  const timeNote = String(plan.plan?.userFit?.timeNote || "")
    .split(/[；;]/)
    .filter((part) => !(allRequiredAcquired && /补购|配送/.test(part)))
    .join("；");

  function toggle(list, setList, name) {
    setList((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  }

  function chooseMaterial(name, kind) {
    if (kind === "cart") {
      setGotSel((cur) => cur.filter((item) => item !== name));
      toggle(cartSel, setCartSel, name);
    } else {
      setCartSel((cur) => cur.filter((item) => item !== name));
      toggle(gotSel, setGotSel, name);
    }
  }

  async function handleFeedback(option) {
    setBusy(true);
    try {
      await onFeedback(option, mealName);
    } finally {
      setBusy(false);
      setFeedbackOpen(false);
    }
  }

  async function handleCartReplan() {
    setBusy(true);
    try {
      await onCartReplan(cartSel);
    } finally {
      setBusy(false);
    }
  }

  async function handleGotIt() {
    setBusy(true);
    try {
      await onGotIt(gotSel);
      setGotSel([]);
    } finally {
      setBusy(false);
    }
  }

  function choosePantry(name, status) {
    setPantryError("");
    setPantryDraft((cur) => {
      const next = { ...cur };
      if (next[name] === status) delete next[name];
      else next[name] = status;
      return next;
    });
  }

  function markAllPantryAvailable() {
    setPantryError("");
    setPantryDraft((cur) => Object.fromEntries(
      pendingPantry.map((name) => [name, cur[name] || "available"]),
    ));
  }

  async function handlePantryReplan() {
    if (!onPantryReplan || pantryDraftCount !== pendingPantry.length) return;
    setPantryError("");
    setBusy(true);
    try {
      const committed = await onPantryReplan(pantryDraft);
      if (!committed) {
        setPantryError(`模型连接暂时没成功；这 ${pantryDraftCount} 项选择还在，当前旧方案没有被改动。可以按原确认直接重试。`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAlternative() {
    if (!onAlternative || !plan.plan?.stretchMeal?.name) return;
    setBusy(true);
    try {
      await onAlternative({
        sourcePlanId: plan.id,
        candidateName: plan.plan.stretchMeal.name,
        candidateWhy: plan.plan.stretchMeal.why || "",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTarget() {
    const clean = targetInput.trim();
    if (!clean || !onAddTarget) return;
    setBusy(true);
    try {
      const committed = await onAddTarget(clean, targetInputSource);
      if (committed) {
        setTargetInput("");
        setTargetInputSource("ticket_text");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUseInventoryPlan() {
    if (!onUseInventoryPlan) return;
    setBusy(true);
    try {
      await onUseInventoryPlan();
    } finally {
      setBusy(false);
    }
  }

  function missingItemState(name) {
    if (gotIt.some((g) => ingredientNamesMatch(g, name))) return { tag: "本次已拿到", cls: "is-got" };
    if (gotSel.includes(name)) return { tag: "已拿到（待确认）", cls: "is-got" };
    if (cartSel.includes(name)) return { tag: "已勾选模拟补购", cls: "is-carted" };
    if (accepted.some((a) => ingredientNamesMatch(a, name))) return { tag: "模拟待补 · 尚未真实购买", cls: "is-carted" };
    return { tag: "仍缺", cls: "is-missing" };
  }

  return (
    <section className="tn-scene tn-decision" aria-label="今晚的行动单">
      <header className="tn-scene-head">
        <p className="tn-scene-kicker">今晚的行动单</p>
        <VersionStepper plans={plans} activeId={plan.id} onSelect={onSelectPlan} />
      </header>

      {sessionBadge && <p className="tn-source-line">{sessionBadge}{fixedDemo ? " · 固定示例结果" : ""}</p>}
      {plan.requestSnapshot && (
        <p className="tn-source-line">
          库存来源：{plan.requestSnapshot.inventoryMode === "last" ? "上次库存（已重新核对）" : plan.requestSnapshot.inventoryMode === "manual" ? "手动确认" : plan.requestSnapshot.inventoryMode === "empty" ? "用户确认空库存" : "本次图片确认"}
          {` · ${plan.requestSnapshot.inventoryCount ?? 0} 样`}
        </p>
      )}
      {eatFirst?.applied && eatFirst.plannerPriorities.length > 0 && (
        <p className="tn-source-line">规划时已优先考虑：{eatFirst.plannerPriorities.join("、")}（按你确认的状态；实际用到哪些以下方方案为准）</p>
      )}
      {eatFirst?.applied && eatFirst.needsConfirmation.length > 0 && (
        <p className="tn-source-line">状态待确认：{eatFirst.needsConfirmation.join("、")}——未进入优先，使用前请自己确认</p>
      )}
      {eatFirst && !eatFirst.applied && (
        <p className="tn-warning" role="note">先吃偏好这次没生效，方案未受影响；你标记的状态已保留在本版。</p>
      )}
      {isRules && (
        <p className="tn-warning" role="note">这是保守兜底方案（规则生成，不是本次模型结果）。模型恢复后建议重新规划。</p>
      )}

      <article className="tn-ticket">
        <header className="tn-ticket-head">
          <p className="tn-ticket-mode">{isTarget ? `想吃的 · ${requestedMealName || "目标菜"}` : "按你有的安排"}</p>
          {alternativeFrom?.candidateName && (
            <p className="tn-ticket-lineage">
              换个思路 · 来自{altSourceSeq ? `第 ${altSourceSeq} 版` : "上一版"}的「{alternativeFrom.candidateName}」；按现实库存重定，不一定是同一道菜
            </p>
          )}
          <p className="tn-ticket-verdict">
            {isTarget
              ? targetNeedsCorrection
                ? plan.plan?.verdict?.title || "先确认具体菜名"
                : pendingPantry.length > 0
                ? `还要确认 ${pendingPantry.length} 样家中常备，再定今晚怎么补`
                : allRequiredAcquired ? `本次所缺材料已拿到，可以按这版准备「${mealName || "目标菜"}」` : plan.plan?.verdict?.title
              : plan.plan?.summary}
          </p>
          {isTarget && targetIntentAccepted && allRequiredAcquired && <p className="tn-ticket-meta">材料状态已更新；做法沿用本版，没有再次调用模型。开火前仍请核对实物。</p>}
          {isTarget && targetIntentAccepted && pendingPantry.length > 0 && (
            <p className="tn-ticket-pendingnote" role="note">
              下面这些材料还没有成为“有”或“缺”的事实；确认后会生成新版本，这一版暂时只作条件参考。
            </p>
          )}
          {isTarget && pendingPantry.length === 0 && !allRequiredAcquired && plan.plan?.verdict?.summary && <p className="tn-ticket-meta">{plan.plan.verdict.summary}</p>}
          {!targetNeedsCorrection && <p className="tn-ticket-meta">
            {cookTimeLabel}
            {isTarget && missing.length > 0 && !allRequiredAcquired ? " · 补购耗时另计" : ""}
          </p>}
          {!targetNeedsCorrection && overBudget && (
            <p className="tn-ticket-timenote" role="note">
              比你说的{timeBudget.label}多一些——开火前把后面的安排挪一挪，或者换个更简单的版本。
            </p>
          )}
        </header>

        {targetNeedsCorrection && (
          <div className="tn-target-blocked" role="note">
            <p className="tn-target-blocked-title">这版没有进入做饭状态</p>
            <p>{targetAssessment.reason || "当前输入还不能作为明确可执行的晚餐目标。"}</p>
            <p>{targetAssessment.clarificationPrompt || "请换一个具体菜名，或按已确认库存重新安排。"}</p>
            <div className="tn-note">
              <input
                className="tn-note-input"
                value={targetInput}
                onChange={(event) => { setTargetInput(event.target.value); setTargetInputSource("ticket_text"); }}
                placeholder="输入具体菜名，比如 番茄牛腩"
                aria-label="修改目标菜名"
                maxLength={30}
              />
              <SpeechInput onTranscript={(text) => { setTargetInput(text); setTargetInputSource("ticket_voice"); }} />
            </div>
            <div className="tn-target-blocked-actions">
              <button type="button" className="tn-btn tn-btn-primary" disabled={!targetInput.trim() || busy} onClick={handleAddTarget}>
                按新菜名生成一版
              </button>
              <button type="button" className="tn-btn tn-btn-quiet" disabled={busy} onClick={handleUseInventoryPlan}>
                不指定菜，按库存决定
              </button>
            </div>
          </div>
        )}

        {isTarget && targetIntentAccepted && (
          <div className="tn-ticket-cols">
            <div className="tn-ticket-col">
              <p className="tn-ticket-coltitle is-have">冰箱原有</p>
              <ul>
                {fridgeAvailable.map((name) => (
                  <li key={name}><span className="tn-ticket-itemname">{name}</span><span className="tn-via is-fridge">冰箱原有</span></li>
                ))}
                {fridgeAvailable.length === 0 && <li className="tn-ticket-empty">没有已确认的冰箱材料</li>}
              </ul>
              {pantryAvailable.length > 0 && (
                <>
                  <p className="tn-ticket-coltitle tn-ticket-confirmtitle is-have">家中已有 · 你确认的</p>
                  <ul>
                    {pantryAvailable.map((name) => (
                      <li key={`pantry-have-${name}`}>
                        <span className="tn-ticket-itemname">{name}</span>
                        <span className="tn-via is-fridge">用户确认家中已有</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {pantryMissing.length > 0 && (
                <p className="tn-pantry-resolved-note">
                  已按“家里没有”重新规划：{pantryMissing.join("、")}。本版需要补的项目会列在后面的补齐状态里。
                </p>
              )}
              {pendingPantry.length > 0 && (
                <div className="tn-pantry-confirm" aria-label="确认家中常备材料">
                  <div className="tn-pantry-confirm-head">
                    <div>
                      <p className="tn-ticket-coltitle tn-ticket-confirmtitle">家里常备 · 待确认</p>
                      <p className="tn-pantry-hint">逐项选“有”或“没有”，选完后只重新规划一次。</p>
                    </div>
                    <button type="button" className="tn-pantry-all" disabled={busy} onClick={markAllPantryAvailable}>
                      {pantryDraftCount > 0 ? "其余都有" : "这些都有"}
                    </button>
                  </div>
                  <ul className="tn-pantry-list">
                    {pendingPantry.map((name) => (
                      <li key={`home-${name}`} className="tn-pantry-item">
                        <span className="tn-ticket-itemname">{name}</span>
                        <div className="tn-pantry-choices" role="group" aria-label={`确认家里是否有${name}`}>
                          <button
                            type="button"
                            className={`tn-pantry-choice ${pantryDraft[name] === "available" ? "is-have" : ""}`}
                            aria-pressed={pantryDraft[name] === "available"}
                            disabled={busy}
                            onClick={() => choosePantry(name, "available")}
                          >
                            家里有
                          </button>
                          <button
                            type="button"
                            className={`tn-pantry-choice ${pantryDraft[name] === "missing" ? "is-missing" : ""}`}
                            aria-pressed={pantryDraft[name] === "missing"}
                            disabled={busy}
                            onClick={() => choosePantry(name, "missing")}
                          >
                            家里没有
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="tn-btn tn-btn-quiet tn-pantry-apply"
                    disabled={busy || pantryDraftCount !== pendingPantry.length}
                    onClick={handlePantryReplan}
                  >
                    {busy ? "正在按确认结果更新…" : pantryDraftCount === pendingPantry.length
                      ? pantryError ? `按原确认重试更新` : `按这 ${pantryDraftCount} 样确认更新方案`
                      : `还需确认 ${pendingPantry.length - pantryDraftCount} 样`}
                  </button>
                  {pantryError && <p className="tn-pantry-error" role="alert">{pantryError}</p>}
                  {pantryDraftCount < pendingPantry.length && (
                    <p className="tn-pantry-hint">全部选完后再统一更新一次，避免每确认一项都等待模型。</p>
                  )}
                </div>
              )}
            </div>
            <div className="tn-ticket-col">
              <p className="tn-ticket-coltitle is-miss">本次还差 / 补齐状态</p>
              <ul>
                {materialNames.map((name) => {
                  const st = missingItemState(name);
                  const isAccepted = accepted.some((item) => ingredientNamesMatch(item, name));
                  return (
                    <li key={name}>
                      <div>
                        <span className="tn-ticket-itemname">{name}</span>
                        <span className={`tn-via ${st.cls}`}>{st.tag}{mustBuyReasons.get(name) ? ` · ${mustBuyReasons.get(name)}` : ""}</span>
                      </div>
                      {st.cls !== "is-got" && (
                        <div className="tn-missing-actions">
                          {!isAccepted && (
                            <button
                              type="button"
                              className="tn-cartbtn"
                              aria-pressed={cartSel.includes(name)}
                              aria-label={`${cartSel.includes(name) ? "撤销" : "加入"}${name}的模拟补购`}
                              onClick={() => chooseMaterial(name, "cart")}
                            >
                              {cartSel.includes(name) ? "撤销模拟补购" : "加入模拟补购"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="tn-cartbtn tn-gotbtn"
                            aria-pressed={gotSel.includes(name)}
                            aria-label={`${gotSel.includes(name) ? "撤销" : "确认"}${name}本次已拿到`}
                            onClick={() => chooseMaterial(name, "got")}
                          >
                            {gotSel.includes(name) ? "撤销已拿到" : "本次已拿到"}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {materialNames.length === 0 && <li className="tn-ticket-empty">没有关键缺料</li>}
              </ul>
              {optionalMissing.length > 0 && <p className="tn-ticket-meta">可选升级（不影响这版成立）：{optionalMissing.join("、")}</p>}
            </div>
          </div>
        )}

        {isTarget && targetIntentAccepted && (cartSel.length > 0 || gotSel.length > 0) && (
          <div className="tn-ticket-actions">
            {cartSel.length > 0 && (
              <button type="button" className="tn-btn tn-btn-primary" disabled={busy} onClick={handleCartReplan}>
                按这些重算（模拟补购 · 不会真实下单）
              </button>
            )}
            {gotSel.length > 0 && (
              <button type="button" className="tn-btn tn-btn-quiet" disabled={busy} onClick={handleGotIt}>
                确认本次已拿到
              </button>
            )}
          </div>
        )}
        {targetIntentAccepted && accepted.length > 0 && (
          <p className="tn-ticket-cartnote" role="status">
            模拟补购：{accepted.join("、")} —— 只是帮你算清「补齐后能不能做」，没有真实下单，也不会扣款。
          </p>
        )}

        {!isTarget && (
          <div className="tn-ticket-free">
            <p className="tn-ticket-dishname">{plan.plan?.baseMeal?.name}</p>
            <p className="tn-ticket-meta">{plan.plan?.baseMeal?.why}</p>
            <p className="tn-ticket-meta">
              {plan.plan?.baseMeal?.timeCost} · {plan.plan?.baseMeal?.difficulty}
            </p>
            {(plan.plan?.baseMeal?.requiredItems || []).length > 0 && (
              <p className="tn-ticket-meta">用到了你有的：{plan.plan.baseMeal.requiredItems.join("、")}</p>
            )}
            {plan.plan?.stretchMeal?.name ? (
              <div className="tn-ticket-altbox">
                <p className="tn-ticket-alt">另一个思路：{plan.plan.stretchMeal.name} —— {plan.plan.stretchMeal.why}</p>
                <button type="button" className="tn-btn tn-btn-quiet tn-altbtn" disabled={busy} onClick={handleAlternative}>
                  按这个思路重新定一版
                </button>
              </div>
            ) : null}
          </div>
        )}

        {canShowCookingPreview && <div className="tn-ticket-steps">
          <div className="tn-ticket-stepshead">
            <p className="tn-ticket-coltitle">{canEnterCooking ? "开火之后" : "条件确认后这样做"}</p>
            {canEnterCooking && displaySteps.length > 0 && (
              <button type="button" className="tn-bigsteps-open" onClick={() => setBigStepsOpen(true)}>
                大字看
              </button>
            )}
          </div>
          <ol>
            {displaySteps.map((step, i) => (
              <li key={i} className={canEnterCooking && stepPosition === i ? "is-marked" : ""}>
                {step}
                {canEnterCooking && stepPosition === i && <span className="tn-step-tag">做到这一步</span>}
              </li>
            ))}
          </ol>
          {canEnterCooking ? (
            <>
              <button type="button" className="tn-rescue-open" onClick={onRescue}>
                <span className="tn-rescue-open-title">已经在做了，遇到问题？</span>
                <span className="tn-rescue-open-sub">拍一下现场，AI 帮你救 · 最多两轮</span>
              </button>
              <button type="button" className="tn-lifelog-open" onClick={onLifeLog}>
                <span className="tn-rescue-open-title">做完了，记录一下</span>
                <span className="tn-rescue-open-sub">拍张成品，生成可编辑的生活记录草稿 · 不会发布</span>
              </button>
            </>
          ) : (
            <p className="tn-cooking-blocked" role="status">
              {executionState.blockReason === "simulated_materials"
                ? "模拟补购还不等于已经买到；确认本次材料已拿到后，才会开放做饭救援与饭后记录。"
                : "菜名或材料条件还没有确认完成，这一版暂不开放做饭救援与饭后记录。"}
            </p>
          )}
        </div>}

        {targetIntentAccepted && <div className="tn-ticket-tips">
          {displayTips.map((tip, i) => (
            <p key={i}>· {tip}</p>
          ))}
          {isTarget && timeNote ? <p>· {timeNote}</p> : null}
          {isTarget && plan.plan?.userFit?.skillNote ? <p>· {plan.plan.userFit.skillNote}</p> : null}
          <p>· 食材新鲜度、保质期和肉类熟度以你自己检查为准。</p>
        </div>}
      </article>

      {!isTarget && (
        <div className="tn-addtarget">
          <p className="tn-field-label">突然有想吃的？告诉我菜名，按新方案重算</p>
          <div className="tn-note">
            <input
              className="tn-note-input"
              value={targetInput}
              onChange={(e) => { setTargetInput(e.target.value); setTargetInputSource("ticket_text"); }}
              placeholder="比如 番茄牛腩"
              aria-label="补充目标菜"
            />
            <SpeechInput onTranscript={(text) => { setTargetInput(text); setTargetInputSource("ticket_voice"); }} />
          </div>
          <button
            type="button"
            className="tn-btn tn-btn-quiet"
            disabled={!targetInput.trim() || busy}
            onClick={handleAddTarget}
          >
            按「{targetInput.trim() || "这道菜"}」重新规划（生成新版本）
          </button>
        </div>
      )}

      {!targetNeedsCorrection && <div className="tn-feedback">
        <button type="button" className="tn-link" onClick={() => setFeedbackOpen((v) => !v)}>
          这个不合适？
        </button>
        {feedbackOpen && (
          <div className="tn-chips" role="group" aria-label="反馈这版方案">
            {FEEDBACK_OPTIONS.map((option) => (
              <button key={option.type} type="button" className="tn-chip" disabled={busy} onClick={() => handleFeedback(option)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        {feedbackOpen && <p className="tn-foot-hint">除「正合适」只记录外，其余会按你的反馈生成新版本，当前版本保留。</p>}
      </div>}

      <footer className="tn-decision-actions">
        <button type="button" className="tn-btn tn-btn-quiet" onClick={onEditFridge}>库存不对？回去改</button>
        <button type="button" className="tn-link" onClick={onRestart}>换一种开始</button>
      </footer>

      {bigStepsOpen && canEnterCooking && displaySteps.length > 0 && (
        <BigStepsView
          mealName={mealName}
          steps={displaySteps}
          position={typeof stepPosition === "number" ? stepPosition : null}
          onMark={(index) => onMarkStep?.(index)}
          onClose={() => setBigStepsOpen(false)}
        />
      )}
    </section>
  );
}
