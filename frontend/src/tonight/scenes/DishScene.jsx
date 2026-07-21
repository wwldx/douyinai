import { useRef, useState } from "react";
import ImageFocusSelector from "../../components/ImageFocusSelector";
import SpeechInput from "../../components/SpeechInput";
import { SourceBadge, TimeBudgetPicker } from "../bits";
import { imageSourceLabel } from "../model";

function ProgressDots({ current }) {
  const steps = ["这道菜", "现实", "决定"];
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
  dish, setDish, timeBudgetId, setTimeBudgetId, note, setNote,
  fixedDemo, onRecrop, onRestoreOriginal, onReplaceImage, onUseSample, onBack, onConfirm,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const [selecting, setSelecting] = useState(false);

  const candidates = Array.isArray(dish.analysis?.dishNameCandidates)
    ? dish.analysis.dishNameCandidates.filter((c) => c && c !== dish.name).slice(0, 3)
    : [];

  function lockName(name) {
    setDish((cur) => ({ ...cur, name, nameLocked: true }));
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onReplaceImage(file, event.target.dataset.source || "album");
  }

  const canGo = dish.name.trim().length > 0 && Boolean(timeBudgetId);

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
        <p className="tn-warning" role="note">这次没认出菜名，请直接输入；识别失败不影响继续。</p>
      )}

      <div className="tn-subtitle" role="group" aria-label="确认菜名">
        <span className="tn-subtitle-lead">看着像</span>
        <input
          className="tn-subtitle-input"
          value={dish.name}
          onChange={(e) => lockName(e.target.value)}
          aria-label="菜名，可修改"
          placeholder="这道菜叫什么"
        />
        <span className="tn-subtitle-tail">？菜名以你确认的为准</span>
      </div>
      <div className="tn-dish-namerow">
        {candidates.length > 0 && (
          <span className="tn-dish-altname">
            也可能是
            {candidates.map((c) => (
              <button key={c} type="button" className="tn-chip tn-chip-mini" onClick={() => lockName(c)}>{c}</button>
            ))}
          </span>
        )}
        <SpeechInput onTranscript={(text) => lockName(text)} />
      </div>

      <div className="tn-feed-alt tn-dish-replace">
        <button type="button" className="tn-btn tn-btn-quiet" data-source="camera" onClick={() => cameraRef.current?.click()}>拍我刷到的菜</button>
        <button type="button" className="tn-btn tn-btn-quiet" data-source="album" onClick={() => albumRef.current?.click()}>从相册选</button>
        <button type="button" className="tn-btn tn-btn-quiet" onClick={onUseSample}>换一张示例</button>
      </div>

      <TimeBudgetPicker value={timeBudgetId} onChange={setTimeBudgetId} />

      <div className="tn-field">
        <p className="tn-field-label">还有什么要求？（可选）</p>
        <div className="tn-note">
          <input
            className="tn-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="比如：少油、别太辣、不想洗太多锅"
            aria-label="补充要求"
          />
          <SpeechInput onTranscript={(text) => setNote((cur) => (cur ? `${cur}，${text}` : text))} />
        </div>
      </div>

      <footer className="tn-scene-foot">
        <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" disabled={!canGo} onClick={onConfirm}>
          对上冰箱，看看能不能做
        </button>
        {!timeBudgetId && <p className="tn-foot-hint">先选一下今晚愿意留多久</p>}
      </footer>

      <input ref={cameraRef} data-source="camera" type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} data-source="album" type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
