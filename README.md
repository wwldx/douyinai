# 冰箱晚餐视觉搜索 Agent

抖音 AI 创变者计划 2026 大区赛赛道四「视觉搜索」作品。

当前公网为 CloudBase 013，平台 Base URL 已迁到 `rightapi.ai`。014 手机修复候选包已经冻结但尚未部署；013 是 014 的首选回滚，012 保留为最近一次完成严格公网冒烟、静态资源一致性与固定目标菜真实规划的历史基线。

```text
抖音 Feed 刷到想吃的菜
  -> 上传/圈选菜图或用语音、文本表达要求
  -> 拍冰箱并确认可用食材
  -> AI 判断现在能否照着做
  -> 输出步骤、缺料补齐、抖音商城和饭后发布入口
```

## 大区赛执行入口

- [升级总计划](docs/roadmap/大区赛升级总计划-2026-07-13.md)：候选评分、执行顺序、日期、删减和冻结规则。
- [公网部署与回滚计划](docs/deployment/公网部署与回滚计划-2026-07-13.md)：Secret、Docker、HTTPS、外网验收和回滚。
- [历史 Case 检索与评测方案](docs/algorithm/历史Case检索与评测方案-2026-07-13.md)：结构化检索、正反例 ICL、数据隔离和消融。
- [冰箱管理与扩展方向评估](docs/roadmap/冰箱管理与扩展方向评估-2026-07-13.md)：先吃清单、分区移动建议、食品安全边界和其他视觉搜索方向。
- [011 最终交付清单](docs/submission/最终交付清单-011.md)：部署包、Skill、海报、视频、证据哈希和发布收尾顺序。

新功能先进入升级总计划，再开始实现；当前项目不复现 OneReason 的预训练、GRPO、RFT/MOPD 或多 teacher 蒸馏。

## 本地开发

```bash
cp .env.example .env.local
# 把 OPENAI_API_KEY 改为真实 API Key，不能保留中文占位符
npm run dev
```

默认入口：

- 主展示端：`http://localhost:4173/`
- 开发检验台：`http://localhost:4173/dev.html`
- 健康检查：`http://localhost:4173/api/health`

前端热更新模式需要两个终端：

```bash
npm run dev
npm run showcase
```

展示端地址为 `http://localhost:5173/`，Vite 默认把 `/api/*`、`/sliced/*` 和 `/demo-assets/*` 代理到 `4173`。若后端改用其他端口，启动展示端时通过 `BACKEND_ORIGIN` 覆盖。

## 生产运行

生产模式由一个 Node 进程同时提供 React H5 和 API：

```bash
npm run build
PORT=4173 npm start
```

也可使用仓库根目录的 `Dockerfile`：

```bash
docker build -t fridge-dinner-agent .
docker run --rm -p 4173:4173 --env-file .env.local fridge-dinner-agent
```

部署平台至少配置：

```env
OPENAI_API_KEY=真实的 Right Code 或 OpenAI 兼容 API Key
OPENAI_BASE_URL=https://rightapi.ai/codex/v1
MODEL_PROVIDER=rightcode_responses_stream
OPENAI_MODEL=gpt-5.6-terra
VISION_MODEL=gpt-5.6-terra
PLANNING_MODEL=gpt-5.6-terra
LIFE_LOG_MODEL=gpt-5.6-terra
DISABLE_RESPONSE_STORAGE=true
CASE_RETRIEVAL_MODE=off
API_RATE_LIMIT_MAX=80
MODEL_RATE_LIMIT_MAX=30
AGENT_APP_VERSION=014
AGENT_RUNS_ENABLED=true
AGENT_RUNS_BACKEND=cloudbase
AGENT_RUNS_CAPTURE_CONTENT=true
# AGENT_RUNS_ADMIN_TOKEN 只放平台 Secret，不写入代码或文档。
# 公网真实语音可选；凭据只放平台 Secret。
# TENCENTCLOUD_SECRET_ID=你的 SecretId
# TENCENTCLOUD_SECRET_KEY=你的 SecretKey
TENCENT_ASR_ENABLED=true
AUDIO_TRANSCRIPTION_ENABLED=false
# 可选：DATA_DIR=/data/fridge-agent
```

Codex Pro 中可用的模型不等于部署应用自动拥有 API 权限；公网 H5 仍需要服务端 API Key。Key 只能放在平台 Secret 或本机 `.env.local`，不能写入前端和 Git。

`AGENT_APP_VERSION` 必须与 CloudBase 服务版本一致。当前公网为 013；上传候选包时创建 014 并设置 `AGENT_APP_VERSION=014`。014 异常时优先切回 013；不在生产容器内手工改代码或密钥。

## 稳定性

- 主展示端提供 Feed/冰箱双入口、示例冰箱和示例菜图，非现场评委无需准备图片即可走完任一路线。
- 目标菜和冰箱均提供手机直接拍摄与相册选择；Feed 截图可手动框选菜品区域，结果页五类反馈可约束下一轮规划。
- 视觉、规划和生活记录可独立配置模型；健康检查和开发台会显示当前任务路由。
- 视觉识别先调用模型，命中演示图片且模型超时/失败时才使用预分析缓存。
- 语音采用浏览器实时识别优先、腾讯云一句话识别服务端兜底；文本框始终可修改。Right Code 当前只承担视觉和规划，不作为已验证 ASR。
- 无有效 Key 时，示例视觉链路仍可用缓存演示；任意新图片和真实规划需要有效 Key。
- 开发检验台会显示 `model`、`model-timeout-cache` 或 `model-error-cache`，避免把缓存误当真实模型结果。
- 服务端包含 12MB 请求体上限、分组限流、生产错误脱敏、安全头、request ID 和阶段 trace。
- `agent_runs` 记录诊断编号、来源、阶段耗时、token 和白名单结构化输入输出；原始照片、原始音频、API Key、管理员令牌和鉴权头不进入运行记录。

## 评测

项目内置 30 例评测集：11 例视觉识别和 19 例规划/安全案例。

当前三任务 `gpt-5.6-terra` 配置下，固定 30 例真实模型回归为 30/30。该数字只说明当前固定回归集通过，不代表真实用户准确率或线上分布。历史 Case 的 V0/正例/正反例真实消融已完成，小样本未测得规划质量增益且增加 token，因此公网保持 `CASE_RETRIEVAL_MODE=off`。

```bash
npm run eval:validate
npm run eval:retrieval
npm run eval:speech-provider
npm run eval -- --base-url http://localhost:4173
npm run eval -- --base-url http://localhost:4173 --suite planning --limit 3
```

可用 `--output data/eval-results/report.json` 保存报告；该目录不会提交 Git。`eval:retrieval` 只验证 24 条参考 Case 和 8 条检索标签，不能替代已经完成的真实规划消融，也不能外推为真实用户指标。

## Skill 提交物

Skill 源文件位于 `submission/skill/fridge-dinner-visual-search/`。生成官方上传文件：

```bash
npm run skill:package
```

输出：`dist/submission/fridge-dinner-visual-search.skill`。

## 主要目录

```text
frontend/                  React 评委展示端
demo/                      Node API、旧展示页和开发检验台
demo/agent/                视觉与规划 Agent、Schema、模型客户端
data/demo-cache/vision/    演示视觉缓存
data/eval/                 评测集
data/case-memory/          独立历史参考 Case 与检索标签
submission/skill/          官方 Skill 源文件
scripts/run-evals.mjs      评测脚本
scripts/run-retrieval-evals.mjs  检索回归脚本
Dockerfile                 单容器生产部署
docs/                      比赛原文、方案、演示和项目记忆
```

长期约束和当前状态见 [AGENTS.md](AGENTS.md) 与 [docs/AGENT_STATE.md](docs/AGENT_STATE.md)。
