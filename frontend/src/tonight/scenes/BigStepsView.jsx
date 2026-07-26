import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 大字做法视图：湿手友好的只读步骤查看 + 显式位置标记
// 浏览（上一步/下一步）不推进位置；只有点「我现在做到这一步」才写入
// portal 到 body：行动单 section 的 transform 动画会让 fixed 脱离视口，必须上提层级
export default function BigStepsView({ mealName, steps, position, onMark, onClose }) {
  const rootRef = useRef(null);
  const [index, setIndex] = useState(() => {
    if (typeof position === "number" && position >= 0 && position < steps.length) return position;
    return 0;
  });

  // 焦点与背景滚动管理：打开时焦点进层、锁定背景滚动；关闭时恢复入口焦点
  useEffect(() => {
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowLeft") { setIndex((cur) => Math.max(0, cur - 1)); return; }
      if (event.key === "ArrowRight") { setIndex((cur) => Math.min(steps.length - 1, cur + 1)); return; }
      if (event.key === "Tab" && rootRef.current) {
        // Tab 圈禁在对话层内，不进入底层行动单
        const focusables = [...rootRef.current.querySelectorAll("button:not(:disabled)")];
        if (!focusables.length) { event.preventDefault(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!rootRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, steps.length]);

  const markedHere = position === index;
  const markedElsewhere = typeof position === "number" && position !== index;

  return createPortal(
    <div className="tn-bigsteps" role="dialog" aria-modal="true" aria-label="大字做法" ref={rootRef} tabIndex={-1}>
      <header className="tn-bigsteps-head">
        <p className="tn-bigsteps-dish">{mealName || "今晚这道菜"}</p>
        <button type="button" className="tn-bigsteps-close" onClick={onClose} aria-label="关闭大字做法">×</button>
      </header>

      <div className="tn-bigsteps-body">
        <p className="tn-bigsteps-count">第 {index + 1} / {steps.length} 步</p>
        <p className="tn-bigsteps-text">{steps[index]}</p>
        {markedHere && <p className="tn-bigsteps-marked" role="status">已标记：你做到这一步</p>}
        {markedElsewhere && (
          <p className="tn-bigsteps-elsewhere">你说过：做到第 {position + 1} 步</p>
        )}
      </div>

      <footer className="tn-bigsteps-foot">
        <div className="tn-bigsteps-nav">
          <button
            type="button"
            className="tn-bigsteps-navbtn"
            disabled={index === 0}
            onClick={() => setIndex((cur) => Math.max(0, cur - 1))}
          >
            上一步
          </button>
          <button
            type="button"
            className="tn-bigsteps-navbtn"
            disabled={index >= steps.length - 1}
            onClick={() => setIndex((cur) => Math.min(steps.length - 1, cur + 1))}
          >
            下一步
          </button>
        </div>
        <button
          type="button"
          className="tn-btn tn-btn-primary tn-btn-xl"
          disabled={markedHere}
          onClick={() => onMark(index)}
        >
          {markedHere ? "已标记你做到这一步" : "我现在做到这一步"}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
