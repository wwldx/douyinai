# Agent Modules

当前项目使用轻量 Agent 工程结构，而不是重框架。

```text
fridgeVisionAgent.mjs
  -> 视觉识别 Agent
  -> 输入冰箱图片 data URL
  -> 输出 items / uncertainItems / warnings

dinnerPlannerAgent.mjs
  -> 晚餐规划 Agent
  -> 输入确认库存 + 用户上下文 + profile traits
  -> 输出晚餐决策 JSON

modelClient.mjs
  -> OpenAI-compatible / Right Code 请求适配
  -> Responses API / streaming SSE / json_schema

schemas.mjs
  -> Agent 输入输出结构化合约
```

保留轻量结构的原因：

- 比赛 demo 需要稳定、可解释、容易兜底。
- 当前只有视觉识别和晚餐规划两个核心 Agent。
- JSON 合约清晰，后续迁移 LangGraph 或 OpenAI Agents SDK 时可以复用。
