# Agent State

更新时间：2026-07-19  
状态：CloudBase 011 已部署，公网定向门禁、全新浏览器主流程、提交制品收口、`1/1` 实例配置和 011→010→011 回滚彩排完成；当前仅待晚间 iPhone 真机验收及最终门户交付

## 当前目标

赛道四「视觉搜索」冰箱晚餐 Agent：用户从抖音 Feed 刷到想吃的菜，或直接打开冰箱，通过菜图、冰箱图和语音表达需求；系统只基于可确认食材、人工确认库存与时间约束，判断今晚怎么做、还差什么以及是否需要局部补拍。

项目按单人参赛推进。升级优先级与验收状态以 `docs/roadmap/大区赛升级总计划-2026-07-13.md` 为准，部署与回滚以 `docs/deployment/公网部署与回滚计划-2026-07-13.md` 为准。

## 发布基线

- 当前公网：CloudBase 011，地址为 `https://fridge-dinner-agent-281751-9-1304313771.sh.run.tcloudbase.com/`；`AGENT_APP_VERSION=011`，视觉、规划和生活记录均为 `gpt-5.6-terra`，Case 检索为 `off`。
- 当前代码与制品：011。它只合并窄范围结果清洗、未知步骤确认边界、目标菜材料收口和内容相符的黄焖鸡示例，不改变既有 API/JSON 架构。
- 回滚顺序：011 异常时优先切回已验证的 010；009 是次级回滚点。
- 011 部署包：`dist/deployment/fridge-dinner-agent-cloudbase-011.zip`，SHA-256 `7bd665fc232893db35607c803b3fa4a23458b8944d5b3bc02faa1b9a6177ed37`。
- 公网健康检查已确认 `AGENT_APP_VERSION=011`，并保持 `VISION_MODEL/PLANNING_MODEL/LIFE_LOG_MODEL=gpt-5.6-terra`。
- CloudBase 运行配置已从 `0/1` 调整为最小/最大实例 `1/1`；控制台最终确认 011 为 100% 流量、实例数 1，010 保留且流量为 0。

## 011 变更

1. 对目标菜 Planner 的 `confirmAtHome` 做拆分、去重和锅具过滤，避免合法字符串中混入拼接 JSON 或厨具。
2. 对“完全说不清做到哪一步”的 `next_step` 救援增加确定性后置门禁：即使模型返回高置信答案，也强制 `needsConfirmation=true`、降低置信度并追问当前阶段。
3. 将错标为黄焖鸡的旧干锅鸡图片替换为内容相符的新示例图；旧素材保留作审计，不再进入当前固定示例。
4. 目标菜主流程材料判断维持 `enough / missing / unresolved` 三态；U15 单项食材选择不回到主演示。
5. 展示材料、Skill、作品说明、路演稿、海报、固定截图和 75 秒备用视频已按当前合约同步。

## 当前模型证据

- 固定 30 例真实模型回归：30/30，11 例视觉和 19 例规划均为 `source=model`、`gpt-5.6-terra`；平均 18.33 秒、P95 28.03 秒、总 114,467 tokens。报告：`docs/verification/reports/gpt56-terra-full-30-off-frontend-compressed-final-20260718.json`。
- 该 30/30 只代表固定门禁，不是 100% 视觉准确率或真实用户成功率；9 个冰箱样例的明确识别召回均值约 65.2%，加上明确不确定项的覆盖均值约 68.7%。
- 完整 19 例 Case 消融：`off=19/19`、75,487 tokens；`positive=19/19`、89,977 tokens（+19.2%）；`contrast=18/19`、93,641 tokens（+24.1%），且素食麻婆豆腐用例出现动作退化。因此公网继续 `CASE_RETRIEVAL_MODE=off`。
- U10 真实生活记录定向证据：terra、`source=model`、约 26.65 秒、3,228 tokens，输出为可编辑草稿，不代表真实发布。
- U20 未知步骤定向证据：terra、`source=model`、约 24.50 秒、2,809 tokens；后置门禁确认 `needsConfirmation=true` 并带明确追问。每个定向功能当前只有 1 个固定样例。

## 本地发布门禁

- `npm run check` 通过；Agent 单测 9/9；30 例数据校验通过。
- 确定性回归：检索 Recall@4 100%、MRR@4 0.938；替代规则 12/12；先吃规则 10/10；冰箱分区 18/18；生活记录缓存 1/1。
- 生产构建通过；本地 production release smoke 通过，覆盖页面、健康状态、安全头、确定性接口和错误脱敏。
- 011 浏览器验收 47/47：1280×720 与 390×844 无横向溢出，`consoleErrors=[]`、`pageErrors=[]`；覆盖固定示例、局部补拍合并、库存快照、条件往返、模拟补购重规划和方案历史、两轮救援、生活记录、开发台、运维台与内部模型信息隐藏。报告：`docs/verification/reports/browser-acceptance-011-20260719.json`。
- 浏览器报告来自 `127.0.0.1` 且 `agentRuns.enabled=false`，不是公网 011、真实 iPhone Safari、相机、麦克风或 CloudBase 持久化证据。
- 011 压缩包完整性检查通过，未包含 `.env.local`、Git、`node_modules`、`local-users` 或 `local-cache`；新黄焖鸡素材与救援门禁代码已从解包目录核对。

## 011 公网定向验收

- `/api/health` 返回 HTTP 200：provider 为 `rightcode_responses_stream`，三任务模型均为 `gpt-5.6-terra`，`hasApiKey=true`，Case 检索为 `off`；固定请求写入后 `agentRuns.backend=cloudbase`、`state=ready`、`captureContent=true`、`appVersion=011`，无写入错误。
- 固定目标菜请求 `/api/plan-target-dish` 使用诊断编号 `codex011target20260719`，HTTP 200，17.35 秒，`source=model`，模型为 `gpt-5.6-terra`，总计 3,606 tokens；结果正确识别缺少鸡腿肉、已有土豆和香菇，`confirmAtHome` 未混入锅具或拼接 JSON。
- 未带管理员令牌查询 `/api/admin/agent-runs` 返回 401，使用本机令牌文件查询返回 200；CloudBase 中精确命中同一诊断编号和 011 版本，保存结构化请求、输出、来源、耗时、阶段 trace 与 usage。
- `/ops.html` 的连接、筛选、唯一记录、详情展开、结构化输入输出和 1280px 无横向溢出均通过；记录中未发现原始图片/音频、API Key、管理员令牌或鉴权头。仅 `/favicon.ico` 返回 404，不影响业务链路，不为此单独发布新版本。
- 公网首页和新黄焖鸡示例 `/demo-assets/菜/黄焖鸡-示例.png` 均返回 200；公网素材 SHA-256 与本地文件一致。未执行全量回归，符合本轮部署后的定向验证分级。
- 全新浏览器上下文固定示例主流程通过：黄焖鸡示例、冰箱示例、8 项库存和结果页均正常，首屏/库存/结果无横向溢出，无业务资源失败、console error 或 page error；结果约 27 秒返回且展示端未泄露内部模型信息。
- 一次独立浏览器首访曾出现 503，随即以 `/api/health` 和首页复核均为 200，后续完整主流程通过。CloudBase 最小实例现已调为 1。
- 2026-07-19 已完成 011→010→011 真实回滚彩排，全程未调用模型：切到 010 时，切换窗口内一次健康请求在 20 秒无响应后超时，随后 `/api/health` 返回 200、`appVersion=010`、三任务路由均为 terra、Case 检索 off，首页 200；恢复 011 后 `/api/health` 与首页均为 200，`agentRuns.state=ready`，控制台确认 011 恢复 100% 流量。该证据说明回滚路径可用，但不能宣称无缝切换。

## 提交制品

- CloudBase 011：`dist/deployment/fridge-dinner-agent-cloudbase-011.zip`。
- 官方 Skill：`dist/submission/fridge-dinner-visual-search.skill`，SHA-256 `5a3d7ef5687a3d6b96a074ca070107cae1b3b4f47847be339ec3cd89645f4edc`；已确认包内无旧 `focusIngredient` 主流程。
- 海报：`dist/submission/poster/fridge-dinner-agent-poster.png` 与 `.pdf`；PDF 为单页，已渲染复核。
- 备用视频：`dist/submission/video/fridge-dinner-agent-75s-captioned.mp4`，1280×720、H.264/AAC、75.03 秒；另有 `fridge-dinner-agent-75s-silent.mp4` 静音字幕版。两版末页均已加入公网 011 二维码，完整解码通过，抽帧经 macOS Vision 确认指向稳定 HTTPS 域名。
- 二维码使用稳定 HTTPS 域名，当前扫码进入公网 011，海报画面与二维码落地体验已是同一版本；扫码本身仍待 iPhone 复核。

## 下一步（新会话从这里开始）

1. 晚间在 iPhone 上验收当前公网 011：相机、相册、局部补拍、麦克风允许/拒绝、文本兜底、移动网络、两轮救援和海报二维码。
2. 完成最终门户上传、制品异机备份与现场演练；Right Code 金额只从账单读取，不用 token 自行估算。
3. Git commit/push 仍需用户明确授权；当前不能把本机未提交工作区当成 Git 级回滚点。
4. 后续若用 Kimi 3 重构前端，先冻结现有 API/JSON 合约并增加前端适配层；只有流式输出、多图上传或新增状态字段确有必要时，才联动修改服务端调用。

## 固定边界

- 当前是创意比赛，优先比赛呈现、真实链路和可诊断性，不主动扩张产品级隐私工程；`AGENT_RUNS_CAPTURE_CONTENT=true` 可保存白名单结构化内容用于受控测试。
- 最低边界仍不保存 API Key、管理员令牌、认证头、原始照片或原始音频；`agent_runs` 写入失败必须 fail-open。
- 不自动判断过期、变质、气味、熟度或是否安全食用；用户确认是安全敏感结论的前置条件。
- H5 的 `capture="environment"` 只能请求后置相机，不能控制 iOS 系统文件选择菜单。
