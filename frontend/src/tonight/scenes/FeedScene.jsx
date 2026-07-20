import { useRef, useState } from "react";
import { DISH_SAMPLE } from "../flagshipData";

export default function FeedScene({ onWantThis, onUpload }) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState("");

  async function handleWantThis() {
    setError("");
    setLoadingSample(true);
    try {
      await onWantThis();
    } catch (err) {
      setError(err.message || "示例图片加载失败");
    } finally {
      setLoadingSample(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message || "图片读取失败");
    }
  }

  return (
    <section className="tn-feed" aria-label="刷到想吃的菜">
      <figure className="tn-feed-media">
        <img src={DISH_SAMPLE.imageUrl} alt="短视频里刷到的一锅黄焖鸡" />
        <span className="tn-badge tn-badge-sample">示例视频帧</span>
        <figcaption className="tn-feed-caption">
          <span className="tn-feed-author">{DISH_SAMPLE.post.author}</span>
          <span className="tn-feed-text">{DISH_SAMPLE.post.caption}</span>
          <span className="tn-feed-likes" aria-label={`${DISH_SAMPLE.post.likes} 赞`}>♥ {DISH_SAMPLE.post.likes}</span>
        </figcaption>
      </figure>

      <div className="tn-feed-actions">
        <p className="tn-feed-question">刷到想吃的菜，今晚到底能不能做？</p>
        <button className="tn-btn tn-btn-primary tn-btn-xl" type="button" onClick={handleWantThis} disabled={loadingSample}>
          {loadingSample ? "正在定格这道菜…" : "今晚就想吃这个"}
        </button>
        <div className="tn-feed-alt">
          <button type="button" className="tn-btn tn-btn-quiet" onClick={() => cameraRef.current?.click()}>拍我刷到的菜</button>
          <button type="button" className="tn-btn tn-btn-quiet" onClick={() => albumRef.current?.click()}>从相册选</button>
        </div>
        <p className="tn-feed-nextphase">也可以从冰箱直接开始 · 方向确认后接入完整路径</p>
        {error && <p className="tn-error" role="alert">{error}</p>}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={albumRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </section>
  );
}
