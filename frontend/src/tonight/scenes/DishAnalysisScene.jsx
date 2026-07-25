import { useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { TimeBudgetPicker } from "../bits";
import { itemDisplayName } from "../model";

function ProgressDots({ current }) {
  const steps = ["这道菜", "分析", "决定"];
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

export default function DishAnalysisScene({
  dish, timeBudgetId, setTimeBudgetId, note, setNote, onBack, onShowSteps, onCompareFridge,
}) {
  const [expandedIngredients, setExpandedIngredients] = useState({});
  const dishName = String(dish?.name || dish?.analysis?.dishName || "这道菜").trim();
  const ingredientNames = Array.isArray(dish?.analysis?.likelyIngredients)
    ? dish.analysis.likelyIngredients.map(itemDisplayName).filter(Boolean)
    : [];
  const canProceed = Boolean(timeBudgetId);

  function toggleIngredient(key) {
    setExpandedIngredients((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  return (
    <section className="tn-scene tn-analysis" aria-label="菜品分析">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回这道菜">‹</button>
        <ProgressDots current={1} />
      </header>

      <div className="tn-analysis-hero">
        <h1>材料清单和需求</h1>
        <p>先看看「{dishName}」大概会用到什么，再补上你今晚的时间和口味要求；想省事可以直接看步骤，也可以先和冰箱对一下。</p>
        <div className="tn-analysis-tags" aria-label="分析说明">
          <span>用料草稿</span>
          <span>今晚时间</span>
          <span>口味偏好</span>
        </div>
      </div>

      <div className="tn-compare tn-compare-feed tn-analysis-compare" aria-label="目标菜用料分析">
        <p className="tn-compare-title">可能用到的材料</p>
        {ingredientNames.length > 0 ? (
          <ul className="tn-analysis-material-list">
            {ingredientNames.map((name, index) => {
              const key = `${name}-${index}`;
              const expanded = Boolean(expandedIngredients[key]);
              return (
                <li key={key} className={expanded ? "is-expanded" : ""}>
                  <button
                    type="button"
                    className="tn-analysis-material"
                    title={name}
                    aria-expanded={expanded}
                    onClick={() => toggleIngredient(key)}
                  >
                    <span>{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="tn-compare-note">AI 暂时没有列出稳定用料；仍可以先看步骤，或对上冰箱后再判断现实库存。</p>
        )}
        {ingredientNames.length > 0 && (
          <p className="tn-compare-note">根据「{dishName}」的菜图整理；点击材料可查看完整名称。</p>
        )}
      </div>

      <TimeBudgetPicker value={timeBudgetId} onChange={setTimeBudgetId} />

      <div className="tn-field">
        <p className="tn-field-label">还有什么要求？（可选）</p>
        <div className="tn-note tn-dish-note">
          <input
            className="tn-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="比如：少油、别太辣、不想洗太多锅"
            aria-label="补充要求"
          />
          <SpeechInput
            iconOnly
            className="tn-dish-note-speech"
            onTranscript={(text) => setNote((cur) => (cur ? `${cur}，${text}` : text))}
          />
        </div>
      </div>

      <footer className="tn-scene-foot tn-analysis-actions">
        <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" disabled={!canProceed} onClick={onShowSteps}>
          展示做菜步骤
        </button>
        <button type="button" className="tn-btn tn-btn-quiet tn-btn-xl" disabled={!canProceed} onClick={onCompareFridge}>
          对上冰箱，看看能不能做
        </button>
        {!canProceed && <p className="tn-foot-hint">先选一下今晚愿意留多久</p>}
      </footer>
    </section>
  );
}
