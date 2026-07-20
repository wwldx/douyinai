import { useState } from "react";
import ImageFocusSelector from "../../components/ImageFocusSelector";
import SpeechInput from "../../components/SpeechInput";
import { DISH_SAMPLE, TIME_OPTIONS } from "../flagshipData";

export default function DishScene({ image, isSample, initialName, initialNote, initialTime, onBack, onConfirm }) {
  const [currentImage, setCurrentImage] = useState(image);
  const [cropped, setCropped] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [name, setName] = useState(initialName);
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [time, setTime] = useState(initialTime);

  const candidates = DISH_SAMPLE.candidates.filter((c) => c !== name);

  function applyCrop(croppedImage) {
    setCurrentImage(croppedImage);
    setCropped(true);
    setSelecting(false);
    // 用户手改过的菜名不被圈选重识别覆盖
    if (!nameTouched) setName(DISH_SAMPLE.name);
  }

  const isFlagshipDish = name.trim() === DISH_SAMPLE.name;
  const canGo = name.trim().length > 0 && isFlagshipDish;

  return (
    <section className="tn-scene tn-dish" aria-label="确认这道菜">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回刷到的菜">‹</button>
        <p className="tn-scene-kicker">先把这道菜认清楚</p>
      </header>

      <div className="tn-dish-media">
        <img src={currentImage} alt="想做的菜" />
        {isSample
          ? <span className="tn-badge tn-badge-sample">示例识别</span>
          : <span className="tn-badge tn-badge-demo">演示数据 · 真实识别接入前</span>}
        {!selecting && (
          <button type="button" className="tn-btn tn-btn-glass tn-dish-cropbtn" onClick={() => setSelecting(true)}>
            {cropped ? "重新框选重点" : "画面太杂？圈出这道菜"}
          </button>
        )}
      </div>

      {selecting && (
        <ImageFocusSelector
          imageDataUrl={currentImage}
          onApply={applyCrop}
          onCancel={() => setSelecting(false)}
        />
      )}

      <div className="tn-subtitle" role="group" aria-label="确认菜名">
        <span className="tn-subtitle-lead">看着像</span>
        <input
          className="tn-subtitle-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
          aria-label="菜名，可修改"
          placeholder="这道菜叫什么"
        />
        <span className="tn-subtitle-tail">？菜名以你确认的为准</span>
      </div>
      {candidates.length > 0 && (
        <p className="tn-dish-altname">
          也可能是
          {candidates.map((c) => (
            <button key={c} type="button" className="tn-chip tn-chip-mini" onClick={() => { setName(c); setNameTouched(true); }}>{c}</button>
          ))}
        </p>
      )}
      {!isFlagshipDish && (
        <p className="tn-prototype-note" role="status">
          第一检查点只接通「{DISH_SAMPLE.name}」稳定示例。你的菜名已经保留，真实识别与对应规划将在方向确认后接入。
        </p>
      )}

      <div className="tn-field">
        <p className="tn-field-label">今晚你愿意花多久？</p>
        <div className="tn-chips" role="radiogroup" aria-label="可支配时间">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={time === t}
              className={`tn-chip ${time === t ? "is-on" : ""}`}
              onClick={() => setTime(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

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
        <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" disabled={!canGo} onClick={() => onConfirm({ name: name.trim(), note: note.trim(), time })}>
          对上冰箱，看看能不能做
        </button>
      </footer>
    </section>
  );
}
