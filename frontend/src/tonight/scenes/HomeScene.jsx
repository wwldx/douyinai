import { useState } from "react";
import { SAMPLE_DISH, SAMPLE_FRIDGE } from "../model";

export default function HomeScene({ stage = "dish", onStageChange, onWantThis, onFridgeFirst }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDish = stage === "dish";
  const stageImage = isDish ? SAMPLE_DISH.url : SAMPLE_FRIDGE.url;
  const stageAlt = isDish ? "短视频里刷到的一锅黄焖鸡" : "打开的真实冰箱内部";

  async function handlePrimary() {
    setError("");
    if (!isDish) {
      onFridgeFirst();
      return;
    }
    setBusy(true);
    try {
      await onWantThis();
    } catch (err) {
      setError(err.message || "示例图片加载失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tn-home" aria-label="今晚的两个时刻">
      <header className="tn-home-brand">
        <span className="tn-home-wordmark">冰箱晚餐</span>
        <span className="tn-home-tagline">今晚的决定</span>
      </header>

      <figure className="tn-home-media" key={stage}>
        <img src={stageImage} alt={stageAlt} />
        <span className="tn-badge tn-badge-sample">示例</span>
        {isDish && (
          <figcaption className="tn-feed-caption">
            <span className="tn-feed-author">{SAMPLE_DISH.post.author}</span>
            <span className="tn-feed-text">{SAMPLE_DISH.post.caption}</span>
            <span className="tn-feed-likes" aria-label={`${SAMPLE_DISH.post.likes} 赞`}>♥ {SAMPLE_DISH.post.likes}</span>
          </figcaption>
        )}
      </figure>

      <div className="tn-home-cluster">
        <p className="tn-home-question">
          {isDish ? "刷到想吃的，今晚能不能做？" : "打开冰箱，却不知道吃什么？"}
        </p>
        <button className="tn-btn tn-btn-primary tn-btn-xl" type="button" onClick={handlePrimary} disabled={busy}>
          {busy ? "正在定格这道菜…" : isDish ? "今晚就想吃这个" : "拍冰箱，让它安排"}
        </button>
        {error && <p className="tn-error" role="alert">{error}</p>}

        <button type="button" className="tn-momentband" onClick={() => onStageChange?.(isDish ? "fridge" : "dish")}>
          <img src={isDish ? SAMPLE_FRIDGE.url : SAMPLE_DISH.url} alt="" aria-hidden="true" />
          <span className="tn-momentband-text">
            {isDish ? "或者——你正站在冰箱前，不知道吃什么" : "或者——你刷到了一道想吃的菜"}
          </span>
          <span className="tn-momentband-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
