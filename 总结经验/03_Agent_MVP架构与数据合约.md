# Agent MVP 架构与数据合约

这份文档总结本次项目里比较值得复用的技术架构方式：轻量 Agent、结构化 JSON、前后台分离、用户确认、缓存兜底。

## 1. MVP 不等于架构随便

比赛项目时间短，但越短越需要清楚的数据边界。

不推荐：

```text
前端把图片传给模型
模型返回一大段文字
前端用正则切文字
页面直接渲染
```

推荐：

```text
前端上传输入
服务端 Agent 调模型
模型按 JSON schema 返回
服务端校验和兜底
前端按字段渲染
开发检验台展示原始输入输出
```

## 2. 轻量 Agent 分层

早期 Agent 项目可以先不用重框架，但职责必须拆开。

通用结构：

```text
UI
  -> API endpoint
    -> Agent function
      -> model client
      -> schema validation / fallback
    -> normalized response
  -> UI render
```

本次项目结构可迁移为：

```text
视觉理解 Agent
  -> 识别候选事实
  -> 标注不确定项

用户确认层
  -> 纠正 AI 识别
  -> 决定哪些事实进入规划

规划 Agent
  -> 结合事实、约束、画像
  -> 输出行动路线

商业/生态扩展层
  -> 只在缺口或下一步行动处出现
```

## 3. Agent 职责设计原则

### 3.1 一个 Agent 只负责一类判断

不推荐：

```text
视觉 Agent 同时识别食材、判断新鲜度、决定菜谱、推荐购物。
```

推荐：

```text
视觉 Agent：这张图可能有什么。
确认层：用户说哪些是真的可用。
规划 Agent：基于确认后的事实给方案。
商业模块：在缺材料时提供补齐入口。
```

### 3.2 用户文字优先于模型猜测

本次踩过的问题：

```text
用户把“回锅肉”改成“鱼香肉丝”，但规划仍受图片识别影响。
```

修正原则：

```text
目标菜图片识别只是候选信息。
用户确认后的文本是最终意图。
模型规划时必须优先使用用户文本。
```

可复用到其他场景：

| 场景 | 模型猜测 | 用户确认 |
|---|---|---|
| 简历 Agent | 模型猜岗位 | 用户选择目标岗位 |
| 论文 Agent | 模型猜阅读目标 | 用户选择“看方法/看实验/写综述” |
| 报销 Agent | 模型猜票据类型 | 用户确认报销类型 |
| 菜谱 Agent | 模型猜菜名 | 用户确认想吃什么 |

### 3.3 识别结果不能直接等于事实

多模态识别容易受光线、遮挡、包装影响。

因此：

```text
模型识别结果 = 候选事实
用户确认结果 = 可用于规划的事实
```

这条原则很重要，尤其适用于：

- 图片识别。
- 语音转写。
- OCR。
- 健康、法律、金融相关信息。
- 用户偏好推断。

## 4. JSON Schema 设计

### 4.1 为什么必须结构化

结构化输出的价值：

```text
前端稳定渲染
开发台可检查
失败时可兜底
缓存可复用
后续 Agent 可接力
```

不要让前端从一大段自然语言里猜字段。

### 4.2 Schema 基本字段

每个 Agent 返回建议包含：

```json
{
  "result": {},
  "warnings": [],
  "uncertainItems": [],
  "source": "model",
  "modelError": null
}
```

业务结果里建议包含：

```text
title / name
summary
evidence
steps
missingItems
risks
nextActions
```

### 4.3 source 字段

强烈建议保留：

```text
model
model-timeout-cache
model-error-cache
manual
local-demo
```

用户端可以不展示，开发台必须展示。

这样可以同时满足：

```text
现场稳定
技术透明
调试可追踪
不伪装模型成功
```

## 5. 状态流设计

Agent 项目最容易乱的是状态。

推荐把状态分成：

| 状态 | 来源 | 用途 |
|---|---|---|
| rawInput | 用户原始上传/输入 | 调试和重试 |
| modelCandidate | 模型候选结果 | 给用户确认 |
| confirmedState | 用户确认后的事实 | 进入规划 |
| planningInput | 规划 Agent 输入 | 开发台展示 |
| finalPlan | 最终方案 | 用户端展示 |
| feedbackEvent | 用户反馈行为 | 画像或后续优化 |

核心原则：

```text
进入规划 Agent 的，只能是 confirmedState，而不是未经确认的 raw modelCandidate。
```

## 6. 缓存设计

比赛项目缓存不是作弊，而是现场稳定策略。关键是透明。

推荐：

```text
模型优先
超时后缓存兜底
错误后缓存兜底
开发台标注 source
用户端只呈现稳定体验
```

缓存可以分三类：

| 缓存 | 用途 | 是否提交 |
|---|---|---|
| demo-cache | 固定样例，比赛兜底 | 可以提交 |
| local-cache | 本机运行时模型成功结果 | 不提交 |
| user-cache | 用户个人状态或上次识别 | 视隐私决定，通常不提交 |

## 7. 模型 Client 抽象

即使项目很小，也建议把模型调用封装一层。

原因：

```text
模型 provider 可能换
中转站协议可能不同
流式和非流式可能不同
错误处理需要统一
schema 失败要兜底
```

模型 Client 至少负责：

- 读取环境变量。
- 拼请求。
- 解析响应。
- 处理超时。
- 提取 JSON。
- 返回统一错误。

前端和业务 Agent 不应该关心 provider 细节。

## 8. 什么时候引入重框架

早期不一定需要 LangChain、LangGraph、Dify、Agents SDK。

可以先用轻量函数，等出现这些需求再升级：

```text
多轮状态回滚
复杂工具调用
并行 Agent 协作
长期任务队列
可视化流程编排
人工审批节点
跨会话任务恢复
```

否则重框架容易让比赛项目变慢：

```text
调试复杂
依赖膨胀
现场不可控
讲解成本高
```

一句话：

> MVP 阶段先把业务链路和数据合约做清楚，框架可以后换。

## 9. 新项目架构模板

```text
frontend/
  用户端页面

demo/
  dev.html
  dev.js
  server.mjs
  agent/
    modelClient.mjs
    schemas.mjs
    inputUnderstandingAgent.mjs
    planningAgent.mjs
    fallbackCatalog.mjs

data/
  demo-cache/
  demo-users/
  local-cache/      # gitignore
  local-users/      # gitignore

docs/
  demo/
  strategy/
  submission/
```

## 10. Agent 合约检查清单

每个 Agent endpoint 完成前，检查：

```text
1. 输入字段是否明确？
2. 输出是否有 JSON schema？
3. 是否有错误返回？
4. 是否有 source 字段？
5. 是否能缓存成功结果？
6. 是否能在开发台看到原始输入输出？
7. 前端是否不依赖自然语言解析？
8. 模型失败时页面是否不空白？
9. 用户是否能修改关键识别结果？
10. 是否避免把猜测说成事实？
```

