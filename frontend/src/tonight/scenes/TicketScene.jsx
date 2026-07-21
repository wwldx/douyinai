import { useEffect, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { VersionStepper } from "../bits";
import { FEEDBACK_OPTIONS, isFixedDemoResult, namesMatch, parseMinutes, sessionSourceBadge } from "../model";

export default function TicketScene({
  plan, plans, onSelectPlan, timeBudget, gotIt,
  onFeedback, onCartReplan, onGotIt, onAddTarget, onEditFridge, onRestart,
}) {
  const [cartSel, setCartSel] = useState([]);
  const [gotSel, setGotSel] = useState([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCartSel([]);
    setGotSel([]);
    setFeedbackOpen(false);
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

  const mealName = isTarget ? plan.plan?.targetDish?.name : plan.plan?.baseMeal?.name;
  const accepted = plan.materialState?.simulatedItems || plan.shoppingPreview?.acceptedItems || [];

  const missing = isTarget
    ? [...new Set([
      ...(plan.plan?.inventoryMatch?.missingCritical || []),
      ...(plan.plan?.shoppingPlan?.mustBuy || []).map((item) => item.item),
    ])]
    : [];
  const optionalMissing = isTarget ? [...new Set(plan.plan?.inventoryMatch?.missingOptional || [])] : [];
  const materialNames = [...new Set([...missing, ...accepted, ...gotIt])];
  const allRequiredAcquired = gotIt.length > 0 && accepted.length === 0 && missing.every(
    (name) => gotIt.some((item) => namesMatch(item, name)),
  );
  const mustBuyReasons = new Map((plan.plan?.shoppingPlan?.mustBuy || []).map((b) => [b.item, b.reason]));
  const fridgeAvailable = (plan.plan?.inventoryMatch?.availableItems || []).filter(
    (name) => !accepted.some((item) => namesMatch(item, name)) && !gotIt.some((item) => namesMatch(item, name)),
  );

  const cookTimeText = isTarget ? plan.plan?.targetDish?.estimatedTime : plan.plan?.baseMeal?.timeCost;
  const cleanCookTimeText = String(cookTimeText || "")
    .replace(/[（(][^）)]*补购[^）)]*[）)]/g, "")
    .trim();
  const cookTimeLabel = cleanCookTimeText
    ? /^约/.test(cleanCookTimeText) ? `做饭${cleanCookTimeText}` : `做饭约 ${cleanCookTimeText}`
    : "";
  const cookMinutes = parseMinutes(cookTimeText);
  const overBudget = Boolean(timeBudget?.minutes && cookMinutes && cookMinutes > timeBudget.minutes);
  const rawSteps = isTarget ? plan.plan?.executionPlan?.steps || [] : plan.plan?.baseMeal?.steps || [];
  const displaySteps = rawSteps.map((step, index) => {
    if (!allRequiredAcquired || index !== 0 || !String(step).includes("补购")) return step;
    const tail = String(step).split(/[；;]/).slice(1).join("；").trim();
    return `确认本次已拿到的${gotIt.join("、")}与冰箱材料状态。${tail}`;
  });
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

  function missingItemState(name) {
    if (gotIt.some((g) => namesMatch(g, name))) return { tag: "本次已拿到", cls: "is-got" };
    if (gotSel.includes(name)) return { tag: "已拿到（待确认）", cls: "is-got" };
    if (cartSel.includes(name)) return { tag: "已勾选模拟补购", cls: "is-carted" };
    if (accepted.some((a) => namesMatch(a, name))) return { tag: "模拟待补 · 尚未真实购买", cls: "is-carted" };
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
      {isRules && (
        <p className="tn-warning" role="note">这是保守兜底方案（规则生成，不是本次模型结果）。模型恢复后建议重新规划。</p>
      )}

      <article className="tn-ticket">
        <header className="tn-ticket-head">
          <p className="tn-ticket-mode">{isTarget ? `想吃的 · ${mealName || "目标菜"}` : "按你有的安排"}</p>
          <p className="tn-ticket-verdict">
            {isTarget
              ? allRequiredAcquired ? `本次所缺材料已拿到，可以按这版准备「${mealName || "目标菜"}」` : plan.plan?.verdict?.title
              : plan.plan?.summary}
          </p>
          {isTarget && allRequiredAcquired && <p className="tn-ticket-meta">材料状态已更新；做法沿用本版，没有再次调用模型。开火前仍请核对实物。</p>}
          {isTarget && !allRequiredAcquired && plan.plan?.verdict?.summary && <p className="tn-ticket-meta">{plan.plan.verdict.summary}</p>}
          <p className="tn-ticket-meta">
            {cookTimeLabel}
            {isTarget && missing.length > 0 && !allRequiredAcquired ? " · 补购耗时另计" : ""}
          </p>
          {overBudget && (
            <p className="tn-ticket-timenote" role="note">
              比你说的{timeBudget.label}多一些——开火前把后面的安排挪一挪，或者换个更简单的版本。
            </p>
          )}
        </header>

        {isTarget && (
          <div className="tn-ticket-cols">
            <div className="tn-ticket-col">
              <p className="tn-ticket-coltitle is-have">冰箱原有</p>
              <ul>
                {fridgeAvailable.map((name) => (
                  <li key={name}><span className="tn-ticket-itemname">{name}</span><span className="tn-via is-fridge">冰箱原有</span></li>
                ))}
                {fridgeAvailable.length === 0 && <li className="tn-ticket-empty">没有已确认的冰箱材料</li>}
              </ul>
              {(plan.plan?.shoppingPlan?.confirmAtHome || []).length > 0 && (
                <>
                  <p className="tn-ticket-coltitle tn-ticket-confirmtitle">家里常备 · 请确认</p>
                  <ul>
                {(plan.plan?.shoppingPlan?.confirmAtHome || []).map((name) => (
                  <li key={`home-${name}`}><span className="tn-ticket-itemname">{name}</span><span className="tn-via">家里常备 · 请确认</span></li>
                ))}
                  </ul>
                </>
              )}
            </div>
            <div className="tn-ticket-col">
              <p className="tn-ticket-coltitle is-miss">本次还差 / 补齐状态</p>
              <ul>
                {materialNames.map((name) => {
                  const st = missingItemState(name);
                  const isAccepted = accepted.some((item) => namesMatch(item, name));
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

        {isTarget && (cartSel.length > 0 || gotSel.length > 0) && (
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
        {accepted.length > 0 && (
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
              <p className="tn-ticket-alt">另一个思路：{plan.plan.stretchMeal.name} —— {plan.plan.stretchMeal.why}</p>
            ) : null}
          </div>
        )}

        <div className="tn-ticket-steps">
          <p className="tn-ticket-coltitle">开火之后</p>
          <ol>
            {displaySteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="tn-ticket-tips">
          {displayTips.map((tip, i) => (
            <p key={i}>· {tip}</p>
          ))}
          {isTarget && timeNote ? <p>· {timeNote}</p> : null}
          {isTarget && plan.plan?.userFit?.skillNote ? <p>· {plan.plan.userFit.skillNote}</p> : null}
          <p>· 食材新鲜度、保质期和肉类熟度以你自己检查为准。</p>
        </div>
      </article>

      {!isTarget && (
        <div className="tn-addtarget">
          <p className="tn-field-label">突然有想吃的？告诉我菜名，按新方案重算</p>
          <div className="tn-note">
            <input
              className="tn-note-input"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="比如 番茄牛腩"
              aria-label="补充目标菜"
            />
            <SpeechInput onTranscript={(text) => setTargetInput(text)} />
          </div>
          <button
            type="button"
            className="tn-btn tn-btn-quiet"
            disabled={!targetInput.trim() || busy}
            onClick={() => { onAddTarget(targetInput.trim()); setTargetInput(""); }}
          >
            按「{targetInput.trim() || "这道菜"}」重新规划（生成新版本）
          </button>
        </div>
      )}

      <div className="tn-feedback">
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
      </div>

      <footer className="tn-decision-actions">
        <button type="button" className="tn-btn tn-btn-quiet" onClick={onEditFridge}>库存不对？回去改</button>
        <button type="button" className="tn-link" onClick={onRestart}>换一种开始</button>
      </footer>
    </section>
  );
}
