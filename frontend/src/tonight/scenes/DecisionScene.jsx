import { ALT_PLAN, DISH_SAMPLE, coverageFor, timeToMinutes } from "../flagshipData";

function ViaTag({ via }) {
  if (via === "cart") return <span className="tn-via is-cart">本次模拟补入 · 尚未真实购买</span>;
  if (via === "staple") return <span className="tn-via">家里常备</span>;
  return <span className="tn-via is-fridge">冰箱里有</span>;
}

export default function DecisionScene({
  dishName, timeBudget, note, coverage, inventory, cart,
  activePlan, onSwitchPlan, onToggleCart, onEditFridge, onRestart,
}) {
  const budget = timeToMinutes(timeBudget);
  const altCoverage = coverageFor(ALT_PLAN, inventory, cart);
  const showingTarget = activePlan === "target";
  const plan = showingTarget ? DISH_SAMPLE : ALT_PLAN;
  const cov = showingTarget ? coverage : altCoverage;

  const ready = cov.missing.length === 0;
  const simulatedReady = ready && cov.simulated.length > 0;
  const overBudget = plan.cookMinutes > budget;

  const verdict = showingTarget
    ? ready
      ? simulatedReady
        ? `模拟补齐后，今晚能做${dishName}`
        : `材料齐了，今晚就做${dishName}`
      : `补 ${cov.missing.length} 样，今晚就能做${dishName}`
    : ready
      ? `不用补货，${ALT_PLAN.cookTime}吃${ALT_PLAN.name}`
      : `${ALT_PLAN.name}还差 ${altCoverage.missing.length} 样`;

  return (
    <section className="tn-scene tn-decision" aria-label="今晚的决定">
      <header className="tn-scene-head">
        <p className="tn-scene-kicker">今晚的行动单</p>
      </header>

      <div className="tn-plantabs" role="tablist" aria-label="两个可执行方案">
        <button type="button" role="tab" aria-selected={showingTarget} className={`tn-plantab ${showingTarget ? "is-on" : ""}`} onClick={() => onSwitchPlan("target")}>
          想吃的 · {dishName}
        </button>
        <button type="button" role="tab" aria-selected={!showingTarget} className={`tn-plantab ${showingTarget ? "" : "is-on"}`} onClick={() => onSwitchPlan("alt")}>
          不补货 · {ALT_PLAN.name}
        </button>
      </div>

      <article className="tn-ticket">
        <header className="tn-ticket-head">
          <p className="tn-ticket-verdict">{verdict}</p>
          <p className="tn-ticket-meta">
            {plan.cookTime} · {plan.difficulty || "新手友好"}
            {showingTarget && note ? ` · 你说：${note}` : ""}
          </p>
          {overBudget && (
            <p className="tn-ticket-timenote" role="note">
              比你说的 {timeBudget} 多一些——{showingTarget
                ? "可以切到“不补货”方案，先吃一顿更快的。"
                : "可以回去调整时间，或选择另一份更合适的方案。"}
            </p>
          )}
        </header>

        <div className="tn-ticket-cols">
          <div className="tn-ticket-col">
            <p className="tn-ticket-coltitle is-have">家里已有</p>
            <ul>
              {cov.have.map((need) => (
                <li key={need.id}>
                  <span className="tn-ticket-itemname">{need.name}</span>
                  <ViaTag via={need.via} />
                </li>
              ))}
              {cov.have.length === 0 && <li className="tn-ticket-empty">还没有对上的材料</li>}
            </ul>
          </div>
          <div className="tn-ticket-col">
            <p className="tn-ticket-coltitle is-miss">还差</p>
            <ul>
              {cov.missing.map((need) => (
                <li key={need.id}>
                  <div>
                    <span className="tn-ticket-itemname">{need.name}</span>
                    <span className="tn-ticket-itemdetail">{need.detail}{need.price ? ` · ${need.price}` : ""}</span>
                  </div>
                  <button
                    type="button"
                    className="tn-cartbtn"
                    aria-label={`将${need.name}加入购物车（模拟）`}
                    onClick={() => onToggleCart(need.name)}
                  >
                    加入购物车（模拟）
                  </button>
                </li>
              ))}
              {cov.missing.length === 0 && <li className="tn-ticket-empty">不差了，可以开火</li>}
            </ul>
          </div>
        </div>

        {showingTarget && cov.simulated.length > 0 && (
          <div className="tn-ticket-simulated" aria-label="本次模拟补入">
            <p className="tn-ticket-coltitle is-simulated">本次模拟补入 · 尚未真实购买</p>
            <ul>
              {cov.simulated.map((need) => (
                <li key={need.id}>
                  <span className="tn-ticket-itemname">{need.name}</span>
                  <button
                    type="button"
                    className="tn-cartbtn is-in"
                    aria-label={`撤销模拟补入${need.name}`}
                    onClick={() => onToggleCart(need.name)}
                  >
                    撤销模拟补入
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showingTarget && cart.length > 0 && (
          <p className="tn-ticket-cartnote" role="status">
            模拟购物车：{cart.join("、")} —— 只是帮你算清「补齐后能不能做」，没有真实下单，也不会扣款。
          </p>
        )}

        <div className="tn-ticket-steps">
          <p className="tn-ticket-coltitle">开火之后</p>
          <ol>
            {plan.steps.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>

        <div className="tn-ticket-tips">
          {(plan.tips || []).map((tip, i) => <p key={i}>· {tip}</p>)}
          <p>· 食材新鲜度和保质期以你自己检查为准，AI 不替你做这个判断。</p>
        </div>
      </article>

      <footer className="tn-decision-actions">
        <button type="button" className="tn-btn tn-btn-quiet" onClick={onEditFridge}>库存不对？回去改</button>
        <button type="button" className="tn-link" onClick={onRestart}>换一种开始</button>
      </footer>
    </section>
  );
}
