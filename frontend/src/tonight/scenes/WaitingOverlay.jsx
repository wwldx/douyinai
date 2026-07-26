import { useEffect, useRef, useState } from "react";

function phaseFor(kind, seconds) {
  if (kind === "dish-vision") {
    if (seconds < 3) return "正在压缩并发送图片";
    if (seconds < 18) return "正在理解这道菜";
    if (seconds < 45) return "仍在识别，可继续等待";
    return "网络较慢，可以继续等，或取消后换一种输入方式";
  }
  if (kind === "fridge-vision" || kind === "reshoot") {
    if (seconds < 3) return "正在压缩并发送图片";
    if (seconds < 18) return "正在看冰箱里的东西";
    if (seconds < 45) return "仍在识别，可继续等待";
    return "网络较慢，可以继续等，或取消后换一种输入方式";
  }
  if (kind === "dish-rescue") {
    if (seconds < 3) return "正在压缩并发送现场照片";
    if (seconds < 18) return "正在判断当前状态和补救动作";
    if (seconds < 45) return "仍在分析现场，可继续等待";
    return "网络较慢，可以继续等，或取消后重新提交";
  }
  if (kind === "life-log") {
    if (seconds < 3) return "正在压缩并发送成品图";
    if (seconds < 18) return "正在看这道菜，起草记录";
    if (seconds < 45) return "仍在起草，可继续等待";
    return "网络较慢，可以继续等，或取消后重新提交";
  }
  if (seconds < 3) return "正在整理你确认的库存和约束";
  if (seconds < 16) return "正在权衡做法、缺料和时间";
  return "正在生成可执行步骤和提醒";
}

export default function WaitingOverlay({ pending, onCancel, dishImage, fridgeImage }) {
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - pending.startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [pending.startedAt]);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // 规划可能来自历史版本、手动菜名或纯库存，不能拿当前全局菜图冒充本次请求素材。
  // 因此只有视觉识别任务显示对应缩略图；统一规划等待只展示冻结的文字事实。
  const thumb = pending.kind === "dish-vision" ? dishImage
    : pending.kind === "fridge-vision" || pending.kind === "reshoot" ? fridgeImage
      : null;

  return (
    <div className="tn-waiting" role="dialog" aria-modal="true" aria-label={pending.label}>
      <div className="tn-waiting-card">
        {thumb && <img className="tn-waiting-thumb" src={thumb} alt="" aria-hidden="true" />}
        <p className="tn-waiting-label">{pending.label}</p>
        {pending.demo && <p className="tn-waiting-demo">示例演示 · 与本次晚餐方案无关</p>}
        <p className="tn-waiting-phase" aria-live="polite">{phaseFor(pending.kind, elapsed)}</p>
        <p className="tn-waiting-elapsed">已用 {elapsed} 秒</p>
        {elapsed >= 45 && (
          <p className="tn-waiting-hint">仍在处理。可以继续等，也可以取消后调整条件再来。</p>
        )}
        <button ref={cancelRef} type="button" className="tn-link" onClick={onCancel}>取消并返回</button>
      </div>
    </div>
  );
}
