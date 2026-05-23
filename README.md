# 冰箱晚餐 Agent

赛道 2：视觉搜索  
当前主线：拍一下冰箱，AI 根据可见食材、用户状态和时间约束，推荐今晚最现实的一顿饭。

## 快速启动

```bash
cp .env.example .env.local
# 填写 .env.local 里的 OPENAI_API_KEY
PORT=4174 npm run dev
```

展示页：

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
  index.html             展示界面
  dev.html               开发检验台
  app.js / dev.js        前端交互

assets/
  fridge-images/          演示冰箱图片

data/
  demo-users/             可提交的假用户种子
  local-users/            本机运行时用户记忆和冰箱缓存，已 gitignore

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

晚餐规划 Agent
  -> 读取确认库存 + 用户上下文 + 用户画像 traits
  -> 输出晚餐决策、保底方案、进阶方案、缺料补买和兜底建议
```

保留轻量架构的原因：

- 比赛 demo 更需要稳定、可解释、容易兜底。
- 当前只有两个核心 Agent，重框架会增加现场不确定性。
- JSON Schema 合约已经清楚，后续迁移 LangGraph 或 OpenAI Agents SDK 时可以复用。

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
- [MVP 规划与执行清单](docs/fridge-agent/MVP规划与执行清单.md)
- [作品说明文档](docs/submission/作品说明文档.md)
- [项目长期记忆](AGENTS.md)

## GitHub 上传

```bash
npm run push -- "提交说明"
```

脚本会运行检查并阻止 `.env.local` 等本地密钥文件进入提交。
