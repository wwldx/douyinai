# Agent Modules

当前项目使用轻量 Agent 工程结构，而不是重框架。

```text
fridgeVisionAgent.mjs
  -> 视觉识别 Agent
  -> 输入冰箱图片 data URL
  -> 输出 items / uncertainItems / warnings

targetDishVisionAgent.mjs
  -> 目标菜图识别 Agent
  -> 输入想复刻的菜图 data URL
  -> 输出菜名猜测 / 关键材料 / 可能工具 / 耗时 / 难度

dinnerPlannerAgent.mjs
  -> 晚餐规划 Agent
  -> 输入确认库存 + 用户上下文 + profile traits
  -> 输出晚餐决策 JSON

targetDishPlannerAgent.mjs
  -> 目标菜复刻规划 Agent
  -> 输入确认库存 + 目标菜文字 + 用户上下文 + profile traits
  -> 输出尽量复刻路线 / 缺料 / 难点提醒 / 抖音模拟补齐卡

mockCommerceCatalog.mjs
  -> 抖音商城 / 本地生活模拟商品目录
  -> 只服务缺料、工具缺口和兜底场景

modelClient.mjs
  -> OpenAI-compatible / Right Code 请求适配
  -> Responses API / streaming SSE / json_schema

schemas.mjs
  -> Agent 输入输出结构化合约
```

保留轻量结构的原因：

- 比赛 demo 需要稳定、可解释、容易兜底。
- 当前仍是少量核心 Agent，原生 Node.js 更稳、更容易现场排错。
- JSON 合约清晰，后续迁移 LangGraph 或 OpenAI Agents SDK 时可以复用。
