function ProgressDots({ current }) {
  const steps = ["这道菜", "分析", "步骤"];
  return (
    <ol className="tn-dots" aria-label="进度">
      {steps.map((label, i) => (
        <li key={label} className={i === current ? "is-now" : i < current ? "is-done" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="tn-dots-dot" aria-hidden="true" />
          <span className="tn-dots-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function StepsScene({ dishName, onBack }) {
  return (
    <section className="tn-scene tn-steps" aria-label="做菜步骤">
      <header className="tn-scene-head">
        <button type="button" className="tn-back" onClick={onBack} aria-label="返回">‹</button>
        <ProgressDots current={2} />
      </header>

      <div className="tn-steps-placeholder">
        <p className="tn-steps-kicker">做菜步骤</p>
        <h1>{dishName ? `「${dishName}」步骤页待开发` : "步骤页待开发"}</h1>
        <p>这里会承接刚才的菜品、用料、时间和要求，后续展示真正的备菜到出锅步骤。</p>
      </div>
    </section>
  );
}
