import { useEffect, useRef, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { compressImage, fetchAssetFile } from "../api";
import { RESCUE_SYMPTOMS, SAMPLE_RESCUES, rescueSymptomByKey } from "../model";

const ROUND2_OUTCOMES = [
  { key: "recheck", label: "有好转，再确认一下" },
  { key: "not_improved", label: "还是没好" },
];

function cacheNoteFor(source) {
  if (source === "model-timeout-cache") return "这次模型响应超时，改用了缓存结果；请以你自己的现场为准。";
  if (source === "model-error-cache") return "这次模型出错，改用了缓存结果；请以你自己的现场为准。";
  return null;
}

export default function RescueScene({
  rescue, interrupted, onDismissInterrupted,
  onUpdateDraft, onSubmit, onStartDemo, onExitDemo, onResetRounds, onEnterRound2, onBack,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const taskRef = useRef(0); // 异步任务令牌：模式/方案/轮次变化后，旧任务不得再写入新场景
  const [photo, setPhoto] = useState(null); // 仅内存，不进持久化
  const [photoName, setPhotoName] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [demoError, setDemoError] = useState(false);

  const isDemo = rescue.mode === "demo";
  const demo = rescue.demoAsset;
  const draft = rescue.draft || {};
  const rounds = rescue.rounds || [];
  const isRound2 = rounds.length === 1;
  const latest = rounds[rounds.length - 1] || null;
  const contextKey = `${isDemo}-${rescue.sourcePlanId}-${rescue.status}-${rounds.length}`;

  // 主要状态切换后回到页面起点（结果生成、进入第二轮等）
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [rescue.status, rounds.length, isDemo]);

  // 上下文切换：作废旧异步任务，完整复位照片状态；第二轮必须用新照片
  useEffect(() => {
    taskRef.current += 1;
    setPhoto(null);
    setPhotoName("");
    setPhotoError("");
    setDemoError(false);
    setPhotoBusy(false);
  }, [contextKey]);

  // 示例会话：自动附带示例翻车图（仅内存）；任务绑定令牌，失败给出可见出口
  useEffect(() => {
    if (!isDemo || !demo || photo || demoError) return;
    const token = ++taskRef.current;
    setPhotoBusy(true);
    fetchAssetFile(demo.url, demo.fileName)
      .then((file) => compressImage(file))
      .then((image) => {
        if (taskRef.current !== token) return;
        setPhoto(image);
        setPhotoName(demo.fileName);
      })
      .catch(() => { if (taskRef.current === token) setDemoError(true); })
      .finally(() => { if (taskRef.current === token) setPhotoBusy(false); });
  }, [isDemo, demo, photo, demoError, contextKey]);

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isDemo) return;
    const token = ++taskRef.current;
    setPhotoBusy(true);
    setPhotoError("");
    compressImage(file)
      .then((image) => {
        if (taskRef.current !== token) return;
        setPhoto(image);
        setPhotoName(file.name || "现场照片");
      })
      .catch(() => { if (taskRef.current === token) setPhotoError("这张照片没能处理好，请换一张重试。"); })
      .finally(() => { if (taskRef.current === token) setPhotoBusy(false); });
  }

  const symptomOption = isDemo ? null : rescueSymptomByKey(draft.symptomKey);
  const outcomeChosen = draft.outcome === "recheck" || draft.outcome === "not_improved";
  const canSubmit = Boolean(photo) && !photoBusy && !demoError
    && (isDemo || (Boolean(symptomOption) && (!isRound2 || outcomeChosen)));

  function ContextCard() {
    if (isDemo) {
      return (
        <div className="tn-rescue-context is-demo" role="note">
          <p className="tn-rescue-context-title">示例演示 · {demo.dishName}（{demo.symptomLabel}）</p>
          <p className="tn-rescue-context-sub">与本次晚餐方案无关；示例只演示第一轮，真实救援支持两轮复查。</p>
          <button type="button" className="tn-link" onClick={onExitDemo}>返回方案救援</button>
        </div>
      );
    }
    return (
      <div className="tn-rescue-context" role="note">
        <p className="tn-rescue-context-title">救援依据：第 {rescue.planSnapshot?.sequence} 版 · {rescue.planSnapshot?.dishName || "本版方案"}</p>
        <p className="tn-rescue-context-sub">已冻结这版的菜名与步骤；之后切换其他版本不会改变本次救援依据。</p>
      </div>
    );
  }

  // ---------- 结果视图 ----------

  if (rescue.status === "result" && latest?.result) {
    const result = latest.result;
    const isRules = latest.source === "rules-fallback";
    const cacheNote = cacheNoteFor(latest.source);
    const demoCached = isDemo && typeof latest.source === "string" && latest.source.includes("cache");
    const exhausted = rounds.length >= 2;
    const nextStepText = String(result.nextStep || "").replace(/^现在只做[：:，,]?\s*/, "");
    return (
      <section className="tn-scene tn-rescue" aria-label="做饭救援结果">
        <header className="tn-scene-head">
          <button type="button" className="tn-back" onClick={onBack} aria-label="返回行动单">‹</button>
          <p className="tn-scene-kicker">做饭救援 · {rounds.length === 2 ? "第二轮 · 复查" : "第一轮"}</p>
        </header>

        <ContextCard />

        {rounds.length === 2 && rounds[0]?.result?.headline && (
          <p className="tn-rescue-prev">第一轮建议：{rounds[0].result.headline}</p>
        )}

        <article className="tn-rescue-result">
          <p className="tn-rescue-symptom">
            你遇到的：{latest.symptomLabel}
            {!isDemo && typeof latest.stepIndex === "number" ? ` · 第 ${latest.stepIndex + 1} 步` : ""}
            {latest.outcome ? ` · ${latest.outcome === "not_improved" ? "还是没好" : "有好转"}` : ""}
          </p>
          {isRules && <p className="tn-warning" role="note">模型暂时不可用，这是规则兜底建议，不是本次模型结果。</p>}
          {cacheNote && <p className="tn-warning" role="note">{cacheNote}</p>}
          {demoCached && <p className="tn-rescue-fixed">固定示例结果</p>}
          <h2 className="tn-rescue-headline">{result.headline}</h2>

          {nextStepText && (
            <p className="tn-rescue-now">
              <span className="tn-rescue-nowlabel">现在只做</span>
              {nextStepText}
            </p>
          )}

          {(result.visualObservations || []).length > 0 && (
            <div className="tn-rescue-block">
              <p className="tn-rescue-blocktitle">看到了什么</p>
              <ul>
                {result.visualObservations.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          )}

          {(result.actions || []).length > 0 && (
            <div className="tn-rescue-block">
              <p className="tn-rescue-blocktitle">这样做，每步都能自己核对</p>
              <ol className="tn-rescue-actions">
                {result.actions.map((act, i) => (
                  <li key={i}>
                    <p className="tn-rescue-acttitle">{act.title}</p>
                    <p className="tn-rescue-acttext">{act.instruction}</p>
                    {act.check && <p className="tn-rescue-actcheck">检查点：{act.check}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.askUser ? <p className="tn-warning" role="note">{result.askUser}</p> : null}
          {result.boundaryReminder && <p className="tn-rescue-boundary">{result.boundaryReminder}</p>}
        </article>

        <footer className="tn-scene-foot">
          {isDemo ? (
            <>
              <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={onBack}>回到行动单</button>
              <p className="tn-foot-hint">示例只演示第一轮；你自己的真实救援支持两轮复查。</p>
            </>
          ) : exhausted ? (
            <>
              <p className="tn-rescue-exhausted">本次方案的两轮救援已用完。如果还没解决，建议换个更简单的做法或回到行动单调整方案。</p>
              <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={onBack}>回到行动单</button>
              <button type="button" className="tn-link" onClick={onResetRounds}>有新的问题？重新开始救援</button>
            </>
          ) : (
            <>
              <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={onEnterRound2}>按建议处理过了，进入第二轮复查</button>
              <button type="button" className="tn-btn tn-btn-quiet" onClick={onBack}>可以了，回到行动单</button>
            </>
          )}
        </footer>
      </section>
    );
  }

  // ---------- 填写视图 ----------

  return (
    <section className="tn-scene tn-rescue" aria-label="做饭救援">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回行动单">‹</button>
        <p className="tn-scene-kicker">做饭救援 · {isRound2 ? "第二轮 · 复查" : "第一轮"}</p>
      </header>

      <ContextCard />

      {interrupted && (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">上次请求已中断</p>
          <p className="tn-failbox-detail">现场照片不保存，你填写的步骤、症状和描述都还在；重新添加照片后再提交。</p>
          <div className="tn-failbox-actions">
            <button type="button" className="tn-btn tn-btn-quiet" onClick={onDismissInterrupted}>知道了</button>
          </div>
        </div>
      )}

      {isRound2 && rounds[0]?.result && (
        <div className="tn-rescue-ref" role="note">
          <p className="tn-rescue-reftitle">上一轮：{rounds[0].result.headline}</p>
          {rounds[0].result.actions?.[0] && (
            <p className="tn-rescue-refline">
              首要动作：{rounds[0].result.actions[0].title}
              {rounds[0].result.actions[0].check ? ` · 检查点：${rounds[0].result.actions[0].check}` : ""}
            </p>
          )}
        </div>
      )}

      {isRound2 && (
        <div className="tn-rescue-round2">
          <p className="tn-field-label">按建议处理后，情况怎么样？</p>
          <div className="tn-chips" role="radiogroup" aria-label="处理后情况">
            {ROUND2_OUTCOMES.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={draft.outcome === option.key}
                className={`tn-chip ${draft.outcome === option.key ? "is-on" : ""}`}
                onClick={() => onUpdateDraft({ outcome: option.key })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="tn-rescue-round2-note">请拍处理后的现场照片；第二轮没有示例图，也不会沿用第一轮的照片。</p>
        </div>
      )}

      {!isDemo && (
        <div className="tn-field">
          <p className="tn-field-label">你现在做到哪一步？</p>
          <div className="tn-chips" role="radiogroup" aria-label="当前步骤">
            {(rescue.planSnapshot?.steps || []).map((_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={!draft.stepUnknown && draft.stepIndex === i}
                className={`tn-chip ${!draft.stepUnknown && draft.stepIndex === i ? "is-on" : ""}`}
                onClick={() => onUpdateDraft({ stepIndex: i, stepUnknown: false, stepTouched: true })}
              >
                第 {i + 1} 步
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={Boolean(draft.stepUnknown)}
              className={`tn-chip ${draft.stepUnknown ? "is-on" : ""}`}
              onClick={() => onUpdateDraft({ stepUnknown: true, stepIndex: null, stepTouched: true })}
            >
              说不清
            </button>
          </div>
        </div>
      )}

      {!isDemo ? (
        <div className="tn-field">
          <p className="tn-field-label">遇到了什么事？</p>
          <div className="tn-chips" role="radiogroup" aria-label="现场症状">
            {RESCUE_SYMPTOMS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={draft.symptomKey === option.key}
                className={`tn-chip ${draft.symptomKey === option.key ? "is-on" : ""}`}
                onClick={() => onUpdateDraft({ symptomKey: option.key })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="tn-field">
          <p className="tn-field-label">示例场景</p>
          <p className="tn-rescue-demoline">{demo.dishName} · {demo.symptomLabel}（症状已随示例固定）</p>
        </div>
      )}

      <div className="tn-field">
        <p className="tn-field-label">现场照片</p>
        {isDemo ? (
          demoError ? (
            <div className="tn-failbox" role="alert">
              <p className="tn-failbox-title">示例图加载失败</p>
              <p className="tn-failbox-detail">示例资源暂时不可用；可以重试，或返回你自己的方案救援。</p>
              <div className="tn-failbox-actions">
                <button type="button" className="tn-btn tn-btn-quiet" onClick={() => setDemoError(false)}>重试示例</button>
                <button type="button" className="tn-btn tn-btn-quiet" onClick={onExitDemo}>返回方案救援</button>
              </div>
            </div>
          ) : photo ? (
            <div className="tn-rescue-photo">
              <img src={photo} alt="AI 生成示例翻车图预览" />
              <span className="tn-badge tn-badge-sample">AI 生成示例图</span>
            </div>
          ) : (
            <p className="tn-rescue-photonote">{photoBusy ? "示例图加载中…" : "准备示例图…"}</p>
          )
        ) : photo ? (
          <div className="tn-rescue-photo">
            <img src={photo} alt="现场照片预览" />
            <button type="button" className="tn-btn tn-btn-glass tn-fridge-rebtn" onClick={() => { setPhoto(null); setPhotoName(""); }}>重拍</button>
          </div>
        ) : (
          <div className="tn-rescue-photobtns">
            <button type="button" className="tn-btn tn-btn-quiet" disabled={photoBusy} onClick={() => cameraRef.current?.click()}>
              {photoBusy ? "处理中…" : isRound2 ? "拍处理后的现场" : "拍现场"}
            </button>
            <button type="button" className="tn-btn tn-btn-quiet" disabled={photoBusy} onClick={() => albumRef.current?.click()}>从相册选</button>
          </div>
        )}
        {photoError && <p className="tn-error" role="alert">{photoError}</p>}
        <p className="tn-rescue-photonote">照片只用于本次救援，不会保存；刷新页面后需要重新添加。</p>
      </div>

      <div className="tn-field">
        <p className="tn-field-label">补充一句（可选）</p>
        <div className="tn-note">
          <input
            className="tn-note-input"
            value={draft.description || ""}
            onChange={(e) => onUpdateDraft({ description: e.target.value })}
            placeholder="比如：火开到中大，已经开始粘底"
            aria-label="补充说明"
          />
          <SpeechInput onTranscript={(text) => onUpdateDraft({ description: text })} />
        </div>
        <p className="tn-rescue-boundary">味道、气味和熟度不能只看照片判断，AI 会请你自己尝或确认。</p>
      </div>

      {!isDemo && rounds.length === 0 && (
        <div className="tn-rescue-demoentry">
          <p className="tn-rescue-demotitle">没有现场照片？用示例翻车图看看</p>
          <div className="tn-chips">
            {SAMPLE_RESCUES.map((sample) => (
              <button key={sample.key} type="button" className="tn-chip" disabled={photoBusy} onClick={() => onStartDemo(sample)}>
                {sample.dishName} · {sample.symptomLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="tn-scene-foot">
        <button
          type="button"
          className="tn-btn tn-btn-primary tn-btn-xl"
          disabled={!canSubmit}
          onClick={() => onSubmit({ image: photo, fileName: photoName })}
        >
          {isRound2 ? "提交复查" : "帮我看看怎么救"}
        </button>
        {!photo && !isDemo && <p className="tn-foot-hint">先拍一张{isRound2 ? "处理后的" : ""}现场照片</p>}
        {!isDemo && photo && !symptomOption && <p className="tn-foot-hint">再选一个遇到的情况</p>}
        {!isDemo && isRound2 && photo && symptomOption && !outcomeChosen && <p className="tn-foot-hint">选一下处理后的情况，才能提交复查</p>}
      </footer>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
