import { useState } from "react";
import ImageFocusSelector from "../../components/ImageFocusSelector";
import { SourceBadge } from "../bits";
import { imageSourceLabel } from "../model";

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

export default function DishScene({
  dish, setDish,
  fixedDemo, onRecrop, onRestoreOriginal, onBack, onAnalyze, onFridgeFirst,
}) {
  const [selecting, setSelecting] = useState(false);

  const primaryName = String(dish.analysis?.dishName || "").trim();
  const candidates = Array.isArray(dish.analysis?.dishNameCandidates)
    ? dish.analysis.dishNameCandidates
      .map((candidate) => String(candidate || "").trim())
      .filter((candidate, index, list) => candidate && candidate !== primaryName && list.indexOf(candidate) === index)
      .slice(0, 3)
    : [];
  const visionOptions = [
    primaryName ? { name: primaryName, source: "vision_primary", label: `${primaryName}（AI最可能）` } : null,
    ...candidates.map((candidate) => ({ name: candidate, source: "vision_candidate", label: candidate })),
  ].filter(Boolean);
  const selectedVisionName = (() => {
    if (
      dish.nameConfirmed
      && (dish.nameSource === "vision_primary" || dish.nameSource === "vision_candidate")
      && visionOptions.some((option) => option.name === dish.name)
    ) {
      return dish.name;
    }
    return primaryName || visionOptions[0]?.name || "";
  })();

  function confirmVisionName(name, source) {
    const clean = String(name || "").trim();
    if (!clean) return;
    setDish((cur) => ({
      ...cur,
      name: clean,
      nameLocked: true,
      nameSource: source,
      nameConfirmed: true,
    }));
  }

  function sourceForVisionName(name) {
    return visionOptions.find((option) => option.name === name)?.source || "vision_candidate";
  }

  const hasSelectedVisionName = selectedVisionName.trim().length > 0;

  function handleAnalyze() {
    if (selectedVisionName) {
      confirmVisionName(selectedVisionName, sourceForVisionName(selectedVisionName));
    }
    onAnalyze();
  }

  return (
    <section className="tn-scene tn-dish" aria-label="确认这道菜">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回首屏">‹</button>
        <ProgressDots current={0} />
      </header>

      <div className="tn-dish-media">
        {dish.image ? (
          <img src={dish.image} alt="想做的菜" />
        ) : (
          <div className="tn-media-lost">照片未保存{ dish.name ? `，你已确认想做「${dish.name}」` : ""}</div>
        )}
        <SourceBadge label={imageSourceLabel(dish.imageSource)} tone={dish.imageSource === "sample" ? "sample" : "real"} />
        {fixedDemo && <span className="tn-badge tn-badge-fixed">固定示例结果</span>}
        {dish.image && !selecting && (
          <div className="tn-dish-media-actions">
            <button type="button" className="tn-btn tn-btn-glass tn-dish-cropbtn" onClick={() => setSelecting(true)}>
              画面太杂？圈出这道菜
            </button>
            {dish.originalImage && dish.image !== dish.originalImage && (
              <button type="button" className="tn-btn tn-btn-glass" onClick={onRestoreOriginal}>恢复整张</button>
            )}
          </div>
        )}
      </div>

      {selecting && dish.image && (
        <ImageFocusSelector
          imageDataUrl={dish.image}
          onApply={(cropped) => { setSelecting(false); onRecrop(cropped); }}
          onCancel={() => setSelecting(false)}
        />
      )}

      {dish.analysisSource === "failed" && (
        <p className="tn-warning" role="note">这次没认出菜名。可以返回重试，或先去拍冰箱让它安排。</p>
      )}

      {(primaryName || candidates.length > 0) && (
        <div className="tn-dish-namechoices" role="group" aria-label="选择菜名">
          <p className="tn-field-label">这道菜更像哪一个？</p>
          <div className="tn-dish-choicegrid">
            {visionOptions.map((option) => {
              const isSelected = option.name === selectedVisionName;
              return (
                <button
                  type="button"
                  key={`${option.source}-${option.name}`}
                  className={`tn-dish-choice ${isSelected ? "is-on" : ""}`}
                  onClick={() => confirmVisionName(option.name, option.source)}
                  aria-pressed={isSelected}
                >
                  <span className="tn-dish-choice-name">{option.name}</span>
                  {option.source === "vision_primary" && <span className="tn-dish-choice-tag">（AI最可能）</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer className="tn-scene-foot">
        <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" disabled={!hasSelectedVisionName} onClick={handleAnalyze}>
          分析菜品
        </button>
        {!hasSelectedVisionName && <p className="tn-foot-hint">先确认一个菜名</p>}
        <button type="button" className="tn-link tn-dish-fridge-link" onClick={onFridgeFirst}>
          有其他想吃的菜？点我跳转
        </button>
      </footer>
    </section>
  );
}
