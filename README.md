# 冰箱晚餐 Agent

赛道 2：视觉搜索  
当前主线：拍一下冰箱，AI 根据可见食材、用户状态和时间约束，推荐今晚最现实的一顿饭。

## 快速启动

```bash
cp .env.example .env.local
# 填写 .env.local 里的 OPENAI_API_KEY
PORT=4174 npm run dev
```

比赛展示端需要另开一个终端：

```bash
npm run showcase
```

比赛展示端：

```text
http://localhost:5173/
```

旧展示/兜底页：

```text
http://localhost:4174/
```

开发检验台：

```text
http://localhost:4174/dev.html
```

## 目录结构

```text
demo/
  agent/                 轻量 Agent 模块
    fridgeVisionAgent.mjs
    dinnerPlannerAgent.mjs
    modelClient.mjs
    schemas.mjs
  server.mjs             本地 API 服务
  profile-store.js       用户画像 MVP，读取本地用户文件并提供浏览器兜底
  speech-input.js        本地录音输入实验链路，不作为比赛主流程
  index.html             旧展示/兜底界面
  dev.html               开发检验台
  app.js / dev.js        前端交互

frontend/
  src/                   Vite + React 比赛展示端

scripts/
  mac-speech-transcribe.swift  macOS Speech 本机转写辅助脚本

assets/
  fridge-images/          演示冰箱图片

data/
  demo-users/             可提交的假用户种子
  demo-cache/vision/      可提交的演示图片预分析缓存
  local-users/            本机运行时用户记忆和冰箱缓存，已 gitignore
  local-cache/            本机运行时视觉缓存，已 gitignore

docs/
  demo/                   测试演示和 Demo 方案
  fridge-agent/           冰箱晚餐 Agent MVP 规划
  submission/             作品说明、路演稿、海报文案
  strategy/               赛事分析与选题策略
  archive/                历史讨论和备选方案

AGENTS.md                 项目级长期记忆和协作规范
```

## 当前 Agent 架构

当前没有引入 LangChain / LangGraph / Dify，而是使用轻量两段式 Agent：

```text
视觉识别 Agent
  -> 识别冰箱图片中的可见食材、不确定项和安全边界
  -> 用户人工确认库存

目标菜图识别 Agent
  -> 识别用户想复刻的菜图
  -> 输出菜名猜测、关键材料、工具、耗时和难度

晚餐规划 Agent
  -> 读取确认库存 + 用户上下文 + 用户画像 traits
  -> 输出晚餐决策、保底方案、进阶方案、缺料补买和兜底建议

目标菜复刻规划 Agent
  -> 读取确认库存 + 目标菜文字 + 用户画像 traits
  -> 输出尽量复刻路线、难点提醒、缺料补买和抖音商城/本地生活模拟卡
```

保留轻量架构的原因：

- 比赛 demo 更需要稳定、可解释、容易兜底。
- 当前只有两个核心 Agent，重框架会增加现场不确定性。
- JSON Schema 合约已经清楚，后续迁移 LangGraph 或 OpenAI Agents SDK 时可以复用。

## 抖音场景亮点

新增故事链：

```text
刷到想吃的，拍下冰箱，AI 判断今晚能不能复刻。
```

目标菜复刻不展示分数，而是给出可执行路线：能做就尽量做，难度较高时提醒风险，并提供简化版本、明日准备路线和抖音商城/本地生活模拟补齐卡。结果页还保留饭后「拍成品，发抖音」入口，用来表达做完饭后的生活记录闭环；当前是展示 CTA，不做真实发布。

当前 V2 采用两个明确上传区：一个上传冰箱照片，一个上传想复刻的菜图。多图自动分类暂不进入主流程，后续再做。

演示图片有本地预分析缓存：后端仍然先调用模型；如果超过约 4.5 秒还没返回，并且命中 `data/demo-cache/vision/`，才切到缓存。开发检验台可通过接口返回的 `source` 区分 `model`、`model-timeout-cache` 和 `model-error-cache`。

语音输入保留为实验链路，不进入比赛主演示流程。当前 Right Code `/codex/v1` 未配置常见 ASR 模型，macOS Speech 也容易超时，现场统一使用手动输入目标菜，避免影响主链路稳定性。

## 本地用户记忆

项目内置 3 个演示用户：

```text
data/demo-users/xiaolin.json
data/demo-users/night-coder.json
data/demo-users/fitness-student.json
```

运行时会把用户画像、反馈事件和上次冰箱识别缓存写入：

```text
data/local-users/<userId>/profile.json
data/local-users/<userId>/vision-cache.json
```

`data/local-users/` 已加入 `.gitignore`，用于本机演示和调试，不上传真实用户数据。

这里的“浏览器本地”指 `localStorage`，它属于浏览器站点存储，不是项目目录里的文件；换浏览器、换端口或清理站点数据都可能丢失。因此当前主存储放在 `data/local-users/<userId>/`，`localStorage` 只保存当前选中的演示用户，并在本地服务不可用时作为兜底缓存。

## 关键文档

- [测试演示操作手册](docs/demo/测试演示操作手册.md)
- [双路线演示操作文档](docs/demo/双路线演示操作文档.md)
- [MVP 规划与执行清单](docs/fridge-agent/MVP规划与执行清单.md)
- [作品说明文档](docs/submission/作品说明文档.md)
- [项目长期记忆](AGENTS.md)

## GitHub 上传

```bash
npm run push -- "提交说明"
```

脚本会运行检查并阻止 `.env.local` 等本地密钥文件进入提交。
