import { useEffect, useRef, useState } from "react";
import SpeechInput from "../components/SpeechInput";
import { TIME_OPTIONS, TIME_QUESTION } from "./model";

export function SourceBadge({ label, tone = "sample" }) {
  if (!label) return null;
  return <span className={`tn-badge tn-badge-${tone}`}>{label}</span>;
}

export function TimeBudgetPicker({ value, onChange, compact = false }) {
  return (
    <div className={`tn-field ${compact ? "tn-field-compact" : ""}`}>
      <p className="tn-field-label">{TIME_QUESTION}</p>
      <div className="tn-timegrid" role="radiogroup" aria-label={TIME_QUESTION}>
        {TIME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className={`tn-timecell ${value === option.id ? "is-on" : ""}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VersionStepper({ plans, activeId, onSelect }) {
  if (!plans || plans.length < 2) return null;
  const index = plans.findIndex((p) => p.id === activeId);
  const active = plans[index];
  return (
    <div className="tn-versions" aria-label="方案版本">
      <button
        type="button"
        className="tn-versions-btn"
        disabled={index <= 0}
        onClick={() => onSelect(plans[index - 1].id)}
        aria-label="上一版方案"
      >
        ‹
      </button>
      <span className="tn-versions-label">
        第 {active?.sequence || index + 1} 版 · 当前保留最近 {plans.length} 版
        {active?.snapshotLabel ? <small>{active.snapshotLabel}</small> : null}
      </span>
      <button
        type="button"
        className="tn-versions-btn"
        disabled={index >= plans.length - 1}
        onClick={() => onSelect(plans[index + 1].id)}
        aria-label="下一版方案"
      >
        ›
      </button>
    </div>
  );
}

// 不确定项：最多主动突出 1-2 项，其余折叠；候选确认后才进库存
export function UnsurePanel({ items, onAddNamed, onReshoot, reshootBusyId, reshootResult, onClearReshoot }) {
  const [states, setStates] = useState({});
  const [namingId, setNamingId] = useState(null);
  const [names, setNames] = useState({});
  const [expanded, setExpanded] = useState(false);
  const cameraRefs = useRef({});

  useEffect(() => {
    setStates({});
    setNamingId(null);
    setNames({});
    setExpanded(false);
  }, [items]);

  if (!items?.length) return null;
  const highlighted = items.slice(0, 2);
  const rest = items.slice(2);
  const visible = expanded ? items : highlighted;

  function keyOf(item, index) {
    return `${index}-${item.description || item.reason || index}`;
  }

  function renderItem(item, index) {
    const key = keyOf(item, index);
    const state = states[key];
    if (state?.kind === "added") {
      return (
        <div key={key} className="tn-unsure-item is-done">
          <p>
            <strong>{item.description}</strong>
            <span>已确认是{state.name}，已加入库存</span>
          </p>
        </div>
      );
    }
    return (
      <div key={key} className="tn-unsure-item">
        <p>
          <strong>{item.description}</strong>
          <span>{item.reason}</span>
        </p>
        {namingId === key ? (
          <div className="tn-unsure-namebox tn-addrow">
            <div className="tn-note tn-inline-speech tn-addrow-entry tn-unsure-inlineinput">
              <input
                className="tn-note-input"
                value={names[key] || ""}
                onChange={(e) => setNames((cur) => ({ ...cur, [key]: e.target.value }))}
                placeholder="输入它是什么"
                aria-label={`${item.description} 是什么`}
              />
              <SpeechInput
                iconOnly
                className="tn-inline-speech-btn"
                onTranscript={(text) => setNames((cur) => ({ ...cur, [key]: cur[key] ? `${cur[key]} ${text}` : text }))}
              />
            </div>
            <button
              type="button"
              className="tn-btn tn-btn-quiet"
              disabled={!(names[key] || "").trim()}
              onClick={() => {
                const name = (names[key] || "").trim();
                if (!name) return;
                onAddNamed(name);
                setStates((cur) => ({ ...cur, [key]: { kind: "added", name } }));
                setNamingId(null);
              }}
            >
              加进库存
            </button>
          </div>
        ) : (
          <div className="tn-unsure-actions">
            <button type="button" className="tn-chip tn-chip-mini" onClick={() => setNamingId(key)}>我来确认是什么</button>
            <button
              type="button"
              className="tn-chip tn-chip-mini"
              disabled={reshootBusyId === key}
              onClick={() => cameraRefs.current[key]?.click()}
            >
              {reshootBusyId === key ? "识别中…" : "补拍这一处"}
            </button>
          </div>
        )}
        {reshootResult?.key === key && (
          <div className="tn-reshoot">
            {reshootResult.items.length > 0 ? (
              <>
                <p className="tn-unsure-lead">近照里看到了这些候选；点一下确认，才会加入库存：</p>
                <div className="tn-chips">
                  {reshootResult.items.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="tn-chip"
                      onClick={() => {
                        onAddNamed(name);
                        setStates((cur) => ({ ...cur, [key]: { kind: "added", name } }));
                        onClearReshoot();
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="tn-unsure-lead">补拍还是没看清。这一项仍不进库存，你也可以输入它是什么或稍后再试。</p>
            )}
          </div>
        )}
        <input
          ref={(el) => { cameraRefs.current[key] = el; }}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onReshoot(file, key);
          }}
        />
      </div>
    );
  }

  return (
    <div className="tn-unsure">
      <p className="tn-field-label">这几处没看清，不会替你猜</p>
      <p className="tn-unsure-lead">优先确认这几处；如果里面正是缺的材料，今晚的决定可能会变。</p>
      {visible.map(renderItem)}
      {rest.length > 0 && !expanded && (
        <div className="tn-unsure-more">
          <button type="button" className="tn-link" onClick={() => setExpanded(true)}>
            还有 {rest.length} 处暂未展开（默认不进库存）
          </button>
        </div>
      )}
    </div>
  );
}

export { SpeechInput };
