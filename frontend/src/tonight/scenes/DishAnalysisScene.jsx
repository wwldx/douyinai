import SpeechInput from "../../components/SpeechInput";
import { SourceBadge, TimeBudgetPicker } from "../bits";
import { itemDisplayName, restoreDishOptionSelection } from "../model";
import { feedImageSourceLabel } from "./DishScene";

function cleanText(value) {
  return String(value || "").trim();
}

function displayNames(value) {
  if (!Array.isArray(value)) return [];
  return value.map(itemDisplayName).map(cleanText).filter(Boolean);
}

function ProgressDots({ current }) {
  const steps = ["这道菜", "判断", "决定"];
  return (
    <ol className="tn-dots" aria-label="进度">
      {steps.map((label, index) => (
        <li
          key={label}
          className={index === current ? "is-now" : index < current ? "is-done" : ""}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="tn-dots-dot" aria-hidden="true" />
          <span className="tn-dots-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Fact({ label, value }) {
  return (
    <div className="tn-analysis-fact">
      <span>{label}</span>
      <strong>{value || "AI 暂未给出稳定信息"}</strong>
    </div>
  );
}

export default function DishAnalysisScene({
  dish,
  selectedDishOption,
  timeBudgetId,
  setTimeBudgetId,
  note,
  setNote,
  onBack,
  onGenerateStandard,
  onCompareFridge,
}) {
  // F3 永远从当前 analysis 重新取得完整候选对象，不能信任异步或旧会话遗留的详情副本。
  const option = restoreDishOptionSelection(
    dish?.analysis,
    selectedDishOption || dish?.selectedDishOption,
  );
  const ingredients = displayNames(option?.likelyIngredients);
  const tools = displayNames(option?.requiredTools);
  const canProceed = Boolean(option && timeBudgetId);
  const source = feedImageSourceLabel(dish?.imageSource);

  function payload() {
    return {
      selectedDishOption: option,
      timeBudgetId,
      note: cleanText(note),
      inputProvenance: { imageSource: dish?.imageSource || null },
    };
  }

  if (!option) {
    return (
      <section className="tn-scene tn-analysis" aria-label="菜品判断">
        <header className="tn-scene-head">
          <button type="button" className="tn-back" onClick={onBack} aria-label="返回选择菜名">‹</button>
          <ProgressDots current={1} />
        </header>
        <div className="tn-compare" role="alert">
          <p className="tn-compare-title">还没有确认菜名</p>
          <p className="tn-compare-note">请返回并亲自选择一个识别候选，系统不会替你默认确认。</p>
        </div>
        <footer className="tn-scene-foot">
          <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={onBack}>返回选择菜名</button>
        </footer>
      </section>
    );
  }

  return (
    <section className="tn-scene tn-analysis" aria-label="菜品判断">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回选择菜名">‹</button>
        <ProgressDots current={1} />
      </header>

      <div className="tn-analysis-hero">
        <p className="tn-field-label">已确认想吃</p>
        <h1>{option.name}</h1>
        <SourceBadge label={`来源：${source}`} tone={dish?.imageSource === "sample" ? "sample" : "real"} />
        <p className="tn-analysis-lead">先看清这道菜通常需要什么和大概成本，再决定直接生成，还是起身核对冰箱。</p>
      </div>

      <div className="tn-compare tn-compare-feed tn-analysis-compare" aria-label="这道菜可能需要的材料">
        <p className="tn-compare-title">这道菜通常会用到</p>
        {ingredients.length > 0 ? (
          <ul className="tn-analysis-material-list">
            {ingredients.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
          </ul>
        ) : (
          <p className="tn-compare-note">AI 暂时没有列出稳定材料。</p>
        )}
      </div>

      <div className="tn-analysis-facts" aria-label="AI 对菜品成本的判断">
        <Fact label="AI 预计耗时" value={cleanText(option.estimatedTime)} />
        <Fact label="难度" value={cleanText(option.difficulty)} />
        <Fact label="所需工具" value={tools.join("、")} />
      </div>

      <TimeBudgetPicker value={timeBudgetId} onChange={setTimeBudgetId} />

      <div className="tn-field">
        <p className="tn-field-label">还有什么要求？（可选）</p>
        <div className="tn-note tn-dish-note">
          <input
            className="tn-note-input"
            value={note || ""}
            onChange={(event) => setNote?.(event.target.value)}
            placeholder="比如：少油、别太辣、不想洗太多锅"
            aria-label="补充要求"
            maxLength={120}
          />
          <SpeechInput
            iconOnly
            className="tn-dish-note-speech"
            onTranscript={(text) => setNote?.((current) => (current ? `${current}，${text}` : text))}
          />
        </div>
      </div>

      <footer className="tn-scene-foot tn-analysis-actions">
        <button
          type="button"
          className="tn-btn tn-btn-primary tn-btn-xl"
          disabled={!canProceed}
          onClick={() => onGenerateStandard?.(payload())}
        >
          直接按最佳做法生成
        </button>
        <button
          type="button"
          className="tn-btn tn-btn-quiet tn-btn-xl"
          disabled={!canProceed}
          onClick={() => onCompareFridge?.(payload())}
        >
          对上冰箱，按家里现有的调整
        </button>
        {!timeBudgetId && <p className="tn-foot-hint">请亲自选择今晚愿意留多久</p>}
      </footer>
    </section>
  );
}
