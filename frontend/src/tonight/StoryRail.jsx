const STEPS = [
  { id: "feed", label: "刷到", hint: "看到想吃的菜" },
  { id: "dish", label: "确认", hint: "这是什么菜、今晚的约束" },
  { id: "fridge", label: "现实", hint: "冰箱里真有什么" },
  { id: "decision", label: "决定", hint: "今晚能行动的一餐" },
];

export default function StoryRail({ order, scene, dishImage, dishName, fridgeImage }) {
  const currentIndex = order.indexOf(scene);

  return (
    <aside className="tn-rail" aria-label="今晚进度">
      <p className="tn-rail-brand">冰箱晚餐<span>Tonight, decided.</span></p>
      <ol className="tn-rail-steps">
        {STEPS.map((step, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "now" : "next";
          return (
            <li key={step.id} className={`is-${state}`} aria-current={i === currentIndex ? "step" : undefined}>
              <span className="tn-rail-dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
              <span className="tn-rail-text">
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
              {step.id === "dish" && dishImage && (
                <img className="tn-rail-thumb" src={dishImage} alt={`刷到的菜：${dishName || "未命名"}`} />
              )}
              {step.id === "fridge" && fridgeImage && (
                <img className="tn-rail-thumb" src={fridgeImage} alt="拍下的冰箱" />
              )}
            </li>
          );
        })}
      </ol>
      <p className="tn-rail-loop">刷到 → 对照 → 决定 → 饭后还能生成一条生活记录草稿</p>
    </aside>
  );
}
