import { useEffect, useRef, useState } from "react";
import SpeechInput from "../../components/SpeechInput";
import { compressImage } from "../api";

function cacheNoteFor(source) {
  if (source === "model-timeout-cache") return "这次模型响应超时，改用了缓存结果；请以自己的成品为准。";
  if (source === "model-error-cache") return "这次模型出错，改用了缓存结果；请以自己的成品为准。";
  return null;
}

function savedTimeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function LifeLogScene({
  lifeLog, lastEditedAt, interrupted, onDismissInterrupted,
  onUpdate, onUpdateResult, onSubmit, onRetake, onBack, showNotice,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const taskRef = useRef(0);
  const [photo, setPhoto] = useState(null); // 仅内存，不进持久化
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [tagsText, setTagsText] = useState(""); // 标签原始输入；解析结果同步写入草稿

  const result = lifeLog.result || null;
  const isDraft = lifeLog.status === "draft" && result;

  // 主要状态切换回到页顶
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [lifeLog.status, lifeLog.planId]);

  // 上下文切换（换方案/回到填写）：作废旧任务并复位照片状态
  useEffect(() => {
    taskRef.current += 1;
    setPhoto(null);
    setPhotoBusy(false);
    setPhotoError("");
  }, [lifeLog.planId, lifeLog.status]);

  // 进入草稿或换方案时同步标签字符串；编辑期间不打断输入
  useEffect(() => {
    setTagsText((lifeLog.result?.tags || []).join(" "));
  }, [lifeLog.planId, lifeLog.status, lifeLog.result === null]);

  function parseTags(text) {
    return String(text || "").split(/[\s，,]+/).filter(Boolean).slice(0, 8);
  }

  function commitTags() {
    const parsed = parseTags(tagsText);
    if (JSON.stringify(parsed) !== JSON.stringify(result?.tags || [])) {
      onUpdateResult({ tags: parsed });
    }
    setTagsText(parsed.join(" "));
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const token = ++taskRef.current;
    setPhotoBusy(true);
    setPhotoError("");
    compressImage(file)
      .then((image) => { if (taskRef.current === token) setPhoto(image); })
      .catch(() => { if (taskRef.current === token) setPhotoError("这张照片没能处理好，请换一张重试。"); })
      .finally(() => { if (taskRef.current === token) setPhotoBusy(false); });
  }

  async function copyDraft() {
    const tags = parseTags(tagsText);
    const shots = (result.suggestedShots || []).map((s, i) => `${i + 1}. ${s.shot}${s.onScreenText ? `（字幕：${s.onScreenText}）` : ""}`);
    const text = [
      `标题：${result.selectedTitle || ""}`,
      `封面文案：${result.coverText || ""}`,
      `旁白：${result.voiceoverDraft || ""}`,
      shots.length ? `补拍建议：\n${shots.join("\n")}` : "",
      tags.length ? `标签：${tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}` : "",
      (result.warnings || []).length ? `提醒：${result.warnings.join("；")}` : "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showNotice("已复制完整草稿；尚未发布");
    } catch {
      showNotice("复制失败，请长按文本手动复制");
    }
  }

  function ContextCard() {
    return (
      <div className="tn-rescue-context" role="note">
        <p className="tn-rescue-context-title">绑定：第 {lifeLog.sequence} 版 · {lifeLog.dishName || "这道菜"}</p>
        <p className="tn-rescue-context-sub">
          {lastEditedAt
            ? `草稿自动保存在本次会话，尚未发布 · 最后编辑 ${savedTimeLabel(lastEditedAt)}`
            : "只生成可编辑草稿，自动保存在本次会话，不会发布。"}
        </p>
      </div>
    );
  }

  // ---------- 草稿视图 ----------

  if (isDraft) {
    const cacheNote = cacheNoteFor(lifeLog.source);
    return (
      <section className="tn-scene tn-lifelog" aria-label="生活记录草稿">
        <header className="tn-scene-head">
          <button type="button" className="tn-back" onClick={onBack} aria-label="返回行动单">‹</button>
          <p className="tn-scene-kicker">生活记录 · 草稿</p>
        </header>

        <ContextCard />
        {cacheNote && <p className="tn-warning" role="note">{cacheNote}</p>}
        {lifeLog.source === "rules-fallback" && <p className="tn-warning" role="note">模型暂时不可用，这是规则兜底草稿，不是本次模型结果。</p>}

        {result.visualSummary ? <p className="tn-lifelog-visual">画面：{result.visualSummary}</p> : null}

        <div className="tn-field">
          <p className="tn-field-label">标题（可改）</p>
          {(result.titleOptions || []).length > 1 && (
            <div className="tn-chips" role="radiogroup" aria-label="标题候选">
              {result.titleOptions.map((title) => (
                <button
                  key={title}
                  type="button"
                  role="radio"
                  aria-checked={result.selectedTitle === title}
                  className={`tn-chip ${result.selectedTitle === title ? "is-on" : ""}`}
                  onClick={() => onUpdateResult({ selectedTitle: title })}
                >
                  {title}
                </button>
              ))}
            </div>
          )}
          <input
            className="tn-note-input tn-lifelog-titleinput"
            value={result.selectedTitle || ""}
            maxLength={60}
            onChange={(e) => onUpdateResult({ selectedTitle: e.target.value })}
            aria-label="标题"
          />
        </div>

        <div className="tn-field">
          <p className="tn-field-label">封面文案（可改）</p>
          <input
            className="tn-note-input"
            value={result.coverText || ""}
            maxLength={60}
            onChange={(e) => onUpdateResult({ coverText: e.target.value })}
            aria-label="封面文案"
          />
        </div>

        <div className="tn-field">
          <p className="tn-field-label">旁白（可改）</p>
          <textarea
            className="tn-note-input tn-lifelog-voice"
            rows={5}
            value={result.voiceoverDraft || ""}
            onChange={(e) => onUpdateResult({ voiceoverDraft: e.target.value })}
            aria-label="旁白"
          />
        </div>

        {(result.suggestedShots || []).length > 0 && (
          <div className="tn-field">
            <p className="tn-field-label">补拍建议</p>
            <ul className="tn-lifelog-shots">
              {result.suggestedShots.map((shot, i) => (
                <li key={i}>
                  <span>{shot.shot}</span>
                  {shot.onScreenText && <small>字幕：{shot.onScreenText}</small>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="tn-field">
          <p className="tn-field-label">标签（可改，空格分隔，最多 8 个）</p>
          <input
            className="tn-note-input"
            value={tagsText}
            onChange={(e) => {
              const text = e.target.value;
              setTagsText(text);
              // 本地字符串管输入手感；解析结果每次键入即写入草稿，持久化不依赖失焦
              onUpdateResult({ tags: parseTags(text) });
            }}
            onBlur={commitTags}
            aria-label="标签"
          />
        </div>

        {(result.warnings || []).map((line, i) => (
          <p key={i} className="tn-warning" role="note">{line}</p>
        ))}

        <footer className="tn-scene-foot">
          <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={() => { commitTags(); copyDraft(); }}>
            复制完整草稿
          </button>
          <button type="button" className="tn-btn tn-btn-quiet" onClick={onRetake}>换一张成品图</button>
          <p className="tn-foot-hint">草稿会自动保存在本次会话；不会发布到任何平台。</p>
        </footer>
      </section>
    );
  }

  // ---------- 填写视图 ----------

  const canSubmit = Boolean(photo) && !photoBusy && Boolean((lifeLog.dishName || "").trim());

  return (
    <section className="tn-scene tn-lifelog" aria-label="生活记录">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回行动单">‹</button>
        <p className="tn-scene-kicker">生活记录</p>
      </header>

      <ContextCard />

      {interrupted && (
        <div className="tn-failbox" role="alert">
          <p className="tn-failbox-title">上次请求已中断</p>
          <p className="tn-failbox-detail">成品照片不保存，菜名还在；重新添加照片后再提交。</p>
          <div className="tn-failbox-actions">
            <button type="button" className="tn-btn tn-btn-quiet" onClick={onDismissInterrupted}>知道了</button>
          </div>
        </div>
      )}

      <div className="tn-field">
        <p className="tn-field-label">成品照片</p>
        {photo ? (
          <div className="tn-rescue-photo">
            <img src={photo} alt="成品照片预览" />
            <button type="button" className="tn-btn tn-btn-glass tn-fridge-rebtn" onClick={() => setPhoto(null)}>重拍</button>
          </div>
        ) : (
          <div className="tn-rescue-photobtns">
            <button type="button" className="tn-btn tn-btn-quiet" disabled={photoBusy} onClick={() => cameraRef.current?.click()}>
              {photoBusy ? "处理中…" : "拍成品"}
            </button>
            <button type="button" className="tn-btn tn-btn-quiet" disabled={photoBusy} onClick={() => albumRef.current?.click()}>从相册选</button>
          </div>
        )}
        {photoError && <p className="tn-error" role="alert">{photoError}</p>}
        <p className="tn-rescue-photonote">照片只用于本次起草，不会保存；刷新页面后需要重新添加。</p>
      </div>

      <div className="tn-field">
        <p className="tn-field-label">确认菜名（可改）</p>
        <div className="tn-note">
          <input
            className="tn-note-input"
            value={lifeLog.dishName || ""}
            maxLength={30}
            onChange={(e) => onUpdate({ dishName: e.target.value })}
            placeholder="这道菜叫什么"
            aria-label="菜名"
          />
          <SpeechInput onTranscript={(text) => onUpdate({ dishName: text })} />
        </div>
      </div>

      <p className="tn-rescue-boundary">只根据这张照片和你的菜名起草记录，不评价味道；发布前请自己核对事实。</p>

      <footer className="tn-scene-foot">
        <button
          type="button"
          className="tn-btn tn-btn-primary tn-btn-xl"
          disabled={!canSubmit}
          onClick={() => onSubmit({ image: photo, dishName: (lifeLog.dishName || "").trim() })}
        >
          生成记录草稿
        </button>
        {!photo && <p className="tn-foot-hint">先拍一张成品照片</p>}
        {photo && !(lifeLog.dishName || "").trim() && <p className="tn-foot-hint">再确认一下菜名</p>}
      </footer>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
