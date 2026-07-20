import { useMemo, useRef, useState } from "react";
import { DISH_SAMPLE, FRIDGE_SAMPLE, itemInInventory } from "../flagshipData";
import { fileToDataUrl, urlToDataUrl } from "../imageData";

export default function FridgeScene({ dishName, initialImage, initialIsSample, initialItems, onBack, onConfirm }) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const [image, setImage] = useState(initialImage);
  const [isSample, setIsSample] = useState(initialIsSample);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 已看到的食材：默认全选；返回时按上次确认结果还原
  const [excluded, setExcluded] = useState(() =>
    initialImage
      ? FRIDGE_SAMPLE.seen.filter((s) => !initialItems.includes(s.name)).map((s) => s.name)
      : [],
  );
  // 人工修正对照结果：needId -> "have" | "missing"
  const [overrides, setOverrides] = useState({});
  // 人工补登的食材（包括看清了的遮挡物）
  const [manualAdds, setManualAdds] = useState(() =>
    initialItems.filter((n) => !FRIDGE_SAMPLE.seen.some((s) => s.name === n)),
  );
  const [unsureState, setUnsureState] = useState({}); // id -> "ignored" | "naming" | "added"
  const [unsureNames, setUnsureNames] = useState({});
  const [addingName, setAddingName] = useState("");

  const includedSeen = useMemo(
    () => FRIDGE_SAMPLE.seen.filter((s) => !excluded.includes(s.name)),
    [excluded],
  );

  const baseNames = useMemo(
    () => [...includedSeen.map((s) => s.name), ...manualAdds],
    [includedSeen, manualAdds],
  );

  function needStatus(need) {
    const forced = overrides[need.id];
    if (forced) return forced;
    return itemInInventory(need, baseNames) ? "have" : "missing";
  }

  const neededList = DISH_SAMPLE.needed.filter((n) => !n.staple);
  const matchedNames = new Set(
    neededList.filter((n) => needStatus(n) === "have").map((n) => n.name),
  );

  function toggleSeen(name) {
    setExcluded((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  }

  function addManual(name) {
    const clean = name.trim();
    if (!clean) return false;
    setManualAdds((cur) => (cur.includes(clean) ? cur : [...cur, clean]));
    setAddingName("");
    return true;
  }

  async function loadSample() {
    setError("");
    setLoading(true);
    try {
      setImage(await urlToDataUrl(FRIDGE_SAMPLE.imageUrl));
      setIsSample(true);
    } catch (err) {
      setError(err.message || "示例冰箱加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      setImage(await fileToDataUrl(file));
      setIsSample(false);
    } catch (err) {
      setError(err.message || "图片读取失败");
    }
  }

  function confirm() {
    const names = new Set(baseNames);
    for (const need of neededList) {
      const status = needStatus(need);
      if (status === "have") names.add(need.name);
      if (status === "missing") names.delete(need.name);
    }
    onConfirm({ image, isSample, items: [...names] });
  }

  return (
    <section className="tn-scene tn-fridge" aria-label="对照现实冰箱">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回确认菜名">‹</button>
        <p className="tn-scene-kicker">再看看家里的现实</p>
      </header>

      {!image ? (
        <div className="tn-fridge-empty">
          <p className="tn-fridge-ask">打开冰箱，拍一张</p>
          <p className="tn-fridge-sub">不用收拾，原样拍就行。AI 看完会请你逐项确认。</p>
          <div className="tn-fridge-capture">
            <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={() => cameraRef.current?.click()}>
              拍冰箱
            </button>
            <div className="tn-feed-alt">
              <button type="button" className="tn-btn tn-btn-quiet" onClick={() => albumRef.current?.click()}>从相册选</button>
              <button type="button" className="tn-btn tn-btn-quiet" onClick={loadSample} disabled={loading}>
                {loading ? "载入中…" : "用示例冰箱"}
              </button>
            </div>
          </div>
          {error && <p className="tn-error" role="alert">{error}</p>}
        </div>
      ) : (
        <>
          <div className="tn-fridge-media">
            <img src={image} alt="冰箱内部照片" />
            {isSample
              ? <span className="tn-badge tn-badge-sample">示例识别</span>
              : <span className="tn-badge tn-badge-demo">演示数据 · 真实识别接入前</span>}
            <button type="button" className="tn-btn tn-btn-glass tn-fridge-rebtn" onClick={() => setImage(null)}>重拍</button>
          </div>

          <div className="tn-compare" aria-label="这道菜需要 vs 冰箱里看到的">
            <p className="tn-compare-title">做「{dishName}」，对一遍</p>
            <ul className="tn-compare-list">
              {neededList.map((need) => {
                const status = needStatus(need);
                return (
                  <li key={need.id} className={`tn-need is-${status}`}>
                    <span className="tn-need-mark" aria-hidden="true">{status === "have" ? "✓" : "✗"}</span>
                    <span className="tn-need-name">{need.name}</span>
                    <span className="tn-need-detail">{need.detail}</span>
                    <button
                      type="button"
                      className="tn-need-toggle"
                      onClick={() =>
                        setOverrides((cur) => ({ ...cur, [need.id]: status === "have" ? "missing" : "have" }))
                      }
                    >
                      {status === "have" ? "其实没有" : "其实有"}
                    </button>
                    <span className="tn-sronly">{status === "have" ? "家里有" : "没看到"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="tn-compare-note">
              酱油、料酒、姜按家里常备算；不匹配可在下一步结果里再改。
              {matchedNames.size > 0 && ` 已对上 ${matchedNames.size} 样。`}
            </p>
          </div>

          <div className="tn-field">
            <p className="tn-field-label">冰箱还看到（点掉家里没有的）</p>
            <div className="tn-chips">
              {FRIDGE_SAMPLE.seen.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={!excluded.includes(s.name)}
                  className={`tn-chip ${excluded.includes(s.name) ? "" : "is-on"}`}
                  onClick={() => toggleSeen(s.name)}
                >
                  {s.name}
                  <small>{s.detail}</small>
                </button>
              ))}
            </div>
            <div className="tn-addrow">
              <input
                className="tn-note-input"
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                placeholder="还有没认出来的？手动加上"
                aria-label="手动添加食材"
                onKeyDown={(e) => { if (e.key === "Enter") addManual(addingName); }}
              />
              <button type="button" className="tn-btn tn-btn-quiet" onClick={() => addManual(addingName)}>加上</button>
            </div>
            {manualAdds.length > 0 && (
              <div className="tn-chips">
                {manualAdds.map((n) => (
                  <button key={n} type="button" className="tn-chip is-on" onClick={() => setManualAdds((cur) => cur.filter((x) => x !== n))}>
                    {n}<small>手动加的 · 点按移除</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tn-unsure">
            <p className="tn-field-label">这几处 AI 看不清，不会替你猜</p>
            {FRIDGE_SAMPLE.unsure.map((u) => {
              const state = unsureState[u.id] || "pending";
              return (
                <div key={u.id} className="tn-unsure-item">
                  <p><strong>{u.description}</strong><span>{u.reason}</span></p>
                  {state === "pending" && (
                    <div className="tn-unsure-actions">
                      <button type="button" className="tn-chip tn-chip-mini" onClick={() => setUnsureState((c) => ({ ...c, [u.id]: "naming" }))}>我知道是什么</button>
                      <button type="button" className="tn-chip tn-chip-mini" onClick={() => setUnsureState((c) => ({ ...c, [u.id]: "ignored" }))}>忽略</button>
                    </div>
                  )}
                  {state === "naming" && (
                    <div className="tn-addrow">
                      <input
                        className="tn-note-input"
                        value={unsureNames[u.id] || ""}
                        onChange={(e) => setUnsureNames((c) => ({ ...c, [u.id]: e.target.value }))}
                        placeholder="它是什么"
                        aria-label={`${u.description} 是什么`}
                      />
                      <button type="button" className="tn-btn tn-btn-quiet" onClick={() => {
                        if (addManual(unsureNames[u.id] || "")) {
                          setUnsureState((c) => ({ ...c, [u.id]: "added" }));
                        }
                      }}>加进库存</button>
                    </div>
                  )}
                  {state === "added" && <span className="tn-unsure-done">已确认并加入库存</span>}
                  {state === "ignored" && <span className="tn-unsure-done">已忽略，不进库存</span>}
                </div>
              );
            })}
            <p className="tn-warning" role="note">{FRIDGE_SAMPLE.warnings[0]}</p>
          </div>

          <footer className="tn-scene-foot">
            <button type="button" className="tn-btn tn-btn-primary tn-btn-xl" onClick={confirm}>
              库存确认了，给我今晚的决定
            </button>
          </footer>
        </>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
