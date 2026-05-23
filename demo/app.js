const personas = [
  { id: "tech", label: "技术向" },
  { id: "social", label: "社交向" },
  { id: "contest", label: "竞赛向" },
  { id: "benefit", label: "薅福利" },
  { id: "busy", label: "时间紧" },
];

const samples = [
  {
    id: "hackathon",
    name: "黑客松活动",
    posterTitle: "AI 黑客松",
    posterMeta: "24H Build",
    color: "#2f6f5e",
    fields: {
      title: "抖音 AI 创变者计划中科大站",
      time: "5 月 23 日至 5 月 24 日",
      location: "高新区信智大楼与师生活动中心",
      signup: "队长通过飞书表单提交作品材料",
    },
    highlights: ["现场开发", "导师交流", "游园展示", "评委体验"],
    prep: ["准备 60 秒讲解脚本", "准备可离线演示的样例", "把作品亮点写进海报二维码落地页"],
    personaReasons: {
      tech: "这类活动能直接展示模型调用、前端交互和产品闭环，技术向同学可以把工程能力转成现场可见的作品价值。",
      social: "游园会展示环节需要大量和游客交流，适合想认识其他团队、导师和同龄开发者的同学。",
      contest: "活动和全国赛晋级链路相关，适合希望拿 PASS 卡或后续继续参加复赛的团队。",
      benefit: "现场有餐饮、导师反馈和奖项，但投入时间较高，建议已有作品雏形再参加。",
      busy: "时间成本较高，若只能短时间参与，应优先完成材料提交和游园展示脚本。",
    },
    score: { tech: 92, social: 84, contest: 95, benefit: 76, busy: 68 },
  },
  {
    id: "lecture",
    name: "学术讲座",
    posterTitle: "前沿讲座",
    posterMeta: "LLM Agents",
    color: "#286f7a",
    fields: {
      title: "大模型 Agent 前沿与产业实践讲座",
      time: "周三 19:00",
      location: "GT-C102",
      signup: "扫码预约，现场签到",
    },
    highlights: ["产业案例", "Agent 架构", "问答交流", "证书签到"],
    prep: ["提前看 2 个 Agent 产品案例", "准备一个关于落地边界的问题", "提前 10 分钟到场占座"],
    personaReasons: {
      tech: "主题和大模型 Agent 架构直接相关，适合作为技术选型和项目灵感来源。",
      social: "问答和自由交流环节适合认识同方向同学，但活动主要仍偏知识输入。",
      contest: "可以借讲座中的产业案例优化比赛作品的技术表达和评委答辩。",
      benefit: "有签到和证书信息，但核心收益还是知识内容，不建议只为福利参加。",
      busy: "如果时间紧，可以只参加后半段问答，或让队友记录关键案例。",
    },
    score: { tech: 88, social: 72, contest: 82, benefit: 61, busy: 70 },
  },
  {
    id: "club",
    name: "社团游园",
    posterTitle: "社团开放日",
    posterMeta: "Games & Gifts",
    color: "#d95f43",
    fields: {
      title: "春季社团开放日游园会",
      time: "周六 14:00-17:30",
      location: "师生活动中心一楼大厅",
      signup: "无需报名，现场参与",
    },
    highlights: ["互动游戏", "集章换礼", "社团招新", "现场表演"],
    prep: ["带学生卡方便签到", "约 1 到 2 位同学同行", "预留至少 40 分钟体验摊位"],
    personaReasons: {
      tech: "技术相关内容有限，但可以观察现场互动装置和活动传播方式。",
      social: "非常适合认识社团和新朋友，参与门槛低，现场互动密度高。",
      contest: "可以参考游园摊位的互动机制，为比赛展示设计投票动线。",
      benefit: "集章、礼品和无需报名都比较友好，适合顺路参加。",
      busy: "无需报名，可以短时间逛重点摊位，但不建议排长队项目。",
    },
    score: { tech: 58, social: 93, contest: 76, benefit: 91, busy: 82 },
  },
];

const fallbackUpload = {
  id: "upload",
  name: "现场上传",
  fields: {
    title: "现场上传海报",
    time: "待模型识别",
    location: "待模型识别",
    signup: "待模型识别",
  },
  highlights: ["已进入上传演示", "等待多模态模型接入", "当前展示缓存结构", "可替换为真实接口"],
  prep: ["保留原图方便核对", "接入模型后输出固定 JSON", "字段不确定时标注未识别"],
  personaReasons: {
    tech: "当前上传流程已经保留图片输入和结果渲染位置，后续只需要把缓存分析替换为模型返回的 JSON。",
    social: "上传入口能让游客拿自己的海报试玩，适合现场拉近互动距离。",
    contest: "这个模式证明产品链路支持真实图片输入，但答辩时需要说明模型接口接入状态。",
    benefit: "上传体验直观，但如果只看福利信息，需要模型稳定提取奖品、报名和地点字段。",
    busy: "时间紧时可以先看结构化字段，模型接入后应优先突出时间和地点。",
  },
  score: { tech: 74, social: 78, contest: 70, benefit: 66, busy: 73 },
};

let activeSample = samples[0];
let activePersona = personas[0];

const elements = {
  modeStatus: document.querySelector("#modeStatus"),
  sampleGrid: document.querySelector("#sampleGrid"),
  personaList: document.querySelector("#personaList"),
  posterUpload: document.querySelector("#posterUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  uploadZone: document.querySelector("#uploadZone"),
  resetButton: document.querySelector("#resetButton"),
  resultTitle: document.querySelector("#resultTitle"),
  scoreValue: document.querySelector("#scoreValue"),
  summaryStrip: document.querySelector("#summaryStrip"),
  fitReason: document.querySelector("#fitReason"),
  prepList: document.querySelector("#prepList"),
  highlightList: document.querySelector("#highlightList"),
  calendarText: document.querySelector("#calendarText"),
  shareText: document.querySelector("#shareText"),
  shareCardTitle: document.querySelector("#shareCardTitle"),
  shareCardBody: document.querySelector("#shareCardBody"),
  shareCardMeta: document.querySelector("#shareCardMeta"),
  toast: document.querySelector("#toast"),
};

function renderSamples() {
  elements.sampleGrid.innerHTML = samples
    .map(
      (sample) => `
        <button class="sample-card ${sample.id === activeSample.id ? "active" : ""}" type="button" data-sample-id="${sample.id}">
          <div class="mini-poster" style="background: ${sample.color}">
            <span>${sample.posterMeta}</span>
            <strong>${sample.posterTitle}</strong>
            <span>${sample.fields.time}</span>
          </div>
          <span class="sample-name">${sample.name}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-sample-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = samples.find((sample) => sample.id === button.dataset.sampleId);
      if (!next) return;
      activeSample = next;
      elements.modeStatus.textContent = "缓存样例模式";
      elements.uploadPreview.style.display = "none";
      elements.uploadPreview.removeAttribute("src");
      render();
    });
  });
}

function renderPersonas() {
  elements.personaList.innerHTML = personas
    .map(
      (persona) => `
        <button class="persona-button ${persona.id === activePersona.id ? "active" : ""}" type="button" data-persona-id="${persona.id}" role="option" aria-selected="${persona.id === activePersona.id}">
          ${persona.label}
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-persona-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = personas.find((persona) => persona.id === button.dataset.personaId);
      if (!next) return;
      activePersona = next;
      render();
    });
  });
}

function makeCalendarText(sample) {
  return `日程提醒：${sample.fields.title}，${sample.fields.time}，地点：${sample.fields.location}。建议提前 10 分钟到场，确认报名方式：${sample.fields.signup}。`;
}

function makeShareText(sample, persona) {
  return `我刚用海报速读行动卡看了「${sample.fields.title}」，它对${persona.label}同学的推荐指数是 ${sample.score[persona.id]}。${sample.personaReasons[persona.id]}`;
}

function renderSummary(sample) {
  const fields = [
    ["活动", sample.fields.title],
    ["时间", sample.fields.time],
    ["地点", sample.fields.location],
    ["报名", sample.fields.signup],
  ];

  elements.summaryStrip.innerHTML = fields
    .map(
      ([label, value]) => `
        <div class="summary-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderAnalysis() {
  const sample = activeSample;
  const persona = activePersona;
  const score = sample.score[persona.id];
  const calendarText = makeCalendarText(sample);
  const shareText = makeShareText(sample, persona);

  elements.resultTitle.textContent = sample.fields.title;
  elements.scoreValue.textContent = score;
  elements.fitReason.textContent = sample.personaReasons[persona.id];
  elements.prepList.innerHTML = sample.prep.map((item) => `<li>${item}</li>`).join("");
  elements.highlightList.innerHTML = sample.highlights.map((item) => `<span>${item}</span>`).join("");
  elements.calendarText.textContent = calendarText;
  elements.shareText.textContent = shareText;
  elements.shareCardTitle.textContent = sample.fields.title;
  elements.shareCardBody.textContent = `${persona.label}推荐指数 ${score}。${sample.personaReasons[persona.id]}`;
  elements.shareCardMeta.textContent = `${sample.fields.time} · ${sample.fields.location}`;

  renderSummary(sample);
}

function render() {
  renderSamples();
  renderPersonas();
  renderAnalysis();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1600);
}

async function copyText(targetId) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  const text = target.textContent.trim();

  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast("已复制");
  }
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copyTarget));
});

elements.posterUpload.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const previewUrl = URL.createObjectURL(file);
  elements.uploadPreview.src = previewUrl;
  elements.uploadPreview.style.display = "block";
  activeSample = fallbackUpload;
  elements.modeStatus.textContent = "上传模拟模式";
  render();
});

elements.resetButton.addEventListener("click", () => {
  activeSample = samples[0];
  activePersona = personas[0];
  elements.posterUpload.value = "";
  elements.uploadPreview.style.display = "none";
  elements.uploadPreview.removeAttribute("src");
  elements.modeStatus.textContent = "缓存样例模式";
  render();
});

render();

