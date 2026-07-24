# Agent State

更新时间：2026-07-24

状态：当前公网为用户已完成部署的 CloudBase 013，运行环境已把中转 Base URL 迁到 `rightapi.ai`。真实 iPhone 走查发现“语音写入后手动输入框被挤缩”和“家中常备请确认不可操作”两项问题；本地修复、定向回归、393×844 走查和 014 候选包已完成。014 尚未部署、未切流量、未推送，下一步是在用户上传 014 后做公网与真实 iPhone 复验。

## 当前目标

赛道四「视觉搜索」冰箱晚餐 Agent：用户既可以从“刷到想吃的菜”进入，也可以从“打开冰箱没想法”进入；系统通过菜图/冰箱图、语音或文字和人工确认，把“今晚吃什么”变成可执行决定，并在做饭遇阻和饭后内容回流时继续提供帮助。

第三轮视觉与产品设计权威仍是 `docs/frontend/012第三轮真正前端重构设计简报-2026-07-20.md`。阶段 2 的实现、状态所有权和验收事实见 `docs/frontend/012第三轮-阶段2整体交接-2026-07-23.md`；该交接不反向限制 Kimi 后续的视觉判断。

## Git 与发布状态

- 分支：`codex/frontend-012`
- 手机修复检查点：`6afd133 Fix iPhone input and pantry confirmation flow`
- RightAPI 默认域名检查点：`23bc9b4 Support RightAPI domain defaults`
- 013 修复前存档：`archive/cloudbase-013-pre-mobile-ui-fix-20260724`，指向 `8a3ba41`
- 阶段 2 最终代码检查点：`22d1827 Finalize phase 2 frontend state semantics`
- 阶段 2d：`5efcde4 Checkpoint phase 2d life log drafts`
- 阶段 2c：`345538e Checkpoint phase 2c cooking rescue`
- 阶段 2b：`993fce1 Checkpoint phase 2b large-step view`
- 阶段 2a：`5ae1c84 Checkpoint phase 2a planning continuity`
- 阶段 1：`7712d3c Checkpoint phase 1 mobile dual-route redesign`
- 第三轮旗舰视觉检查点：`08e5f82 Checkpoint third-round flagship frontend redesign`
- 第三轮起点：`375eb2e Prepare fresh Kimi frontend redesign handoff`
- 旧界面回滚点：`b743c2c Clarify simulated shopping replan results`
- 当前公网：CloudBase 013。013 复用 012 代码制品并在平台环境把 `AGENT_APP_VERSION` 改为 `013`、`OPENAI_BASE_URL` 改为 `https://rightapi.ai/codex/v1`；本轮不把用户确认“部署成功”扩写成新的完整模型基线。
- 014 候选包：`dist/deployment/fridge-dinner-agent-cloudbase-014.zip`，43,909,666 bytes，SHA-256 `017790d7edded818aa02f1067ef7186b57a968b2469efb9f04b508261980f70c`；运行时代码绑定 `23bc9b4`。通用包 `dist/deployment/fridge-dinner-agent-cloudbase.zip` 与版本化包哈希相同。
- 014 尚未部署；部署时必须设置 `AGENT_APP_VERSION=014`、`OPENAI_BASE_URL=https://rightapi.ai/codex/v1`、`MODEL_PROVIDER=rightcode_responses_stream`。014 异常时优先切回 013，旧 012/011 继续保留。

## 当前手机产品结构

手机是唯一设计权威；桌面只居中承载手机画布。

- S0 首屏：Feed 与冰箱两个真实时刻在同一舞台可逆互换，选路线前无进度。
- Feed：这道菜 → 现实冰箱对照 → 统一规划 → 目标菜行动单。
- 冰箱：拍冰箱 → 盘点与规划台 → 统一规划 → 自由推荐行动单。
- 行动单：目标菜/自由推荐双变体、材料四态、模拟补购、已拿到、五类反馈、最近三版与“另一个思路”真实派生版本。
- 做法：行动单内联步骤与全屏大字视图共用同一份有效步骤；只有用户明确点“我现在做到这一步”才记录位置。
- 做饭救援：行动单内进入，冻结所查看版本的菜名与步骤，支持真实两轮救援；独立示例始终标明与本次方案无关。
- 生活记录：行动单内进入，真实成品图生成可编辑草稿；按方案自动保存纯文本到本次会话，明确尚未发布。
- 先吃：库存确认页的轻量标记，规则结果冻结进每版请求快照；不代表食材安全或模型实际采用。

## 阶段 2 检查点能力

### 013 真机问题后的 014 修复候选

- 手动添加食材从单行弹性布局改为两行 Grid：输入框与“加上”固定第一行，语音按钮和识别状态固定第二行；输入字号 16px，语音状态不再把文本框挤到不可见。
- 行动单“家里常备 · 待确认”不再是静态文字。每项提供“家里有/家里没有”，全部回答后只统一重规划一次；“其余都有”保留用户已选的“没有”。
- 常备确认作为 `requestSnapshot.pantryConfirmation` 独立保存，不混入冰箱原有、模拟补购或本次已拿到；派生版本继承当前版本快照。
- 常备事实使用严格规范化匹配和极小安全别名，不再用普通食材的双向子串匹配；“油”不会误消解“蚝油”。
- 用户确认家里没有、但模型仍返回为待确认的必要材料，由服务端确定性迁入 `missingCritical` 与 `mustBuy`；若模型已调整路线并省略它，则不强行补回。
- 服务端默认 RightAPI chat 地址与 provider 自动识别已支持 `rightapi.ai`；平台部署仍显式设置 provider，避免环境变量缺失时走错协议。

### 2a：规划连续性

- 先吃标记支持已开封、用户确认标签日期临近、状态不确定；规则失败不阻断主规划。
- 派生版本严格继承来源版本的完整 `requestSnapshot.eatFirst`，避免把旧库存与最新标记混在一起。
- “另一个思路”生成真实新版本；`alternativeFrom.sourceSequence` 在创建时冻结，源版本被最近三版裁掉后血缘仍可解释。
- 首次规划失败冻结完整请求参数；重试、规则兜底和取消不再造成空白行动单或条件漂移。

### 2b：大字做法与位置

- `steps.js` 为行动单、大字视图和救援提供同源有效步骤。
- 大字视图通过 Portal 覆盖真实视口；翻页只是浏览，不写进度。
- `stepPositions[planId]` 只由显式标记写入，按方案隔离并可恢复。

### 2c：做饭救援

- 真实救援最多两轮，结果按“现在只做 → 看到了什么 → 动作与检查点”组织。
- 进入救援冻结 `sourcePlanId + planSnapshot`；已有轮次保持冻结，空会话可刷新同方案最新有效步骤。
- `stepTouched` 区分系统预填与用户主动选步：未触碰时同步最新位置，触碰后保留用户选择；旧草稿只在缺该字段时推断。
- 救援使用单个当前工作区，不建立按方案保存的救援会话池；进入另一方案救援会替换旧工作区。
- `interrupted` 对救援严格绑定 `kind + planId + scope(plan/demo)`；真实与示例不会串中断提示。

### 2d：生活记录草稿

- 草稿按 `planId` 隔离，标题、封面、旁白、补拍建议、标签和提醒均可编辑或复制。
- 编辑立即写穿透到 `lifeLogDrafts[planId]`；`lastEditedAt` 只在内容变化时更新，刷新和重进不会制造假编辑时间。
- 原始成品图只留内存；刷新后保留结构化草稿，不恢复或长期保存图片。
- 当前没有诚实匹配黄焖鸡方案的成品示例图，因此用户端不放错误示例入口。

## 状态所有权

- `plans`：最近三版方案；每版持有自己的请求、材料和来源快照。
- `requestSnapshot.eatFirst`：按版本冻结的先吃规则结果。
- `alternativeFrom`：新版本创建时冻结来源方案 id、序号和候选语义。
- `stepPositions`：按 `planId` 保存用户明确标记的步骤位置。
- `rescue`：全会话单个当前救援工作区；不是按方案的 map。
- `lifeLogDrafts`：按 `planId` 保存生活记录纯文本草稿。
- `interrupted`：保存操作类型；救援额外保存 `planId + scope`，生活记录保存 `planId`，规划/识别类仍是全局中断。
- 原始照片、原始音频：只在当前页面内存中存在，不写入会话恢复。

## 014 候选验证证据（2026-07-24）

- `node --test demo/agent/targetDishPlannerAgent.test.mjs`：5/5，覆盖待确认清洗、用户确认没有后的缺料迁移，以及“油”不等于“蚝油”。
- `npm run showcase:build`：通过，47 modules。
- `npm run cloudbase:package`：通过，并在打包过程中完成 `npm run check`。
- `git diff --check` 与 ZIP 完整性检查：通过；包根目录包含 `Dockerfile`，打包脚本确认不含 `.env`、Git、`node_modules`、本地用户和本地缓存。
- 393×844 页面走查：语音写入模拟值“皮卡丘”后，输入框 250×52、字体 16px；语音按钮 110×44、“加上”76×50；`scrollWidth === clientWidth === 378`，无横向溢出。
- 常备确认按钮 141×44，批量更新按钮 290×50；先选“盐=家里没有”再点“其余都有”后，盐保持没有，食用油与酱油变为已有；未全部回答时更新按钮禁用。
- 无模型 Key 的定向页面测试中，常备更新请求失败后旧行动单仍保留并明确提示失败，没有空白页。
- 本轮没有运行真实 iPhone 麦克风和公网模型请求；这些属于 014 部署后的真机/公网验收，不能用本地浏览器结果替代。

## 阶段 2 与 012 历史验证证据（2026-07-23）

- `npm run showcase:build`：通过，47 modules，Vite 约 437ms。
- `npm run check`：通过。
- `npm run eval:eat-first`：10/10。
- `npm run eval:life-log-cache`：1/1，含受控缓存隔离断言。
- `node --test demo/agent/dishRescueAgent.test.mjs`：8/8。
- `git diff --check`：通过。
- 390×844：`clientWidth=390`、`scrollWidth=390`；版本箭头 44×44，模拟补购与“本次已拿到”均为 44px。
- 浏览器实测：示例救援请求刷新后只在示例内显示中断；返回真实救援后中断卡消失。
- 浏览器实测：未主动选步的空救援同步大字视图最新位置；救援内主动选择第 3 步后，即使全局位置改为第 4 步，重进仍保留第 3 步。
- 空库存代码与浏览器分支：零识别横幅和底部提交互斥；手动清空仍只保留底部空库存确认。
- 本轮没有改模型提示词、Schema 或路由，因此没有重跑 30 例真实模型基线；不把旧基线冒充为本轮结果。
- 012 严格公网冒烟：展示端、开发检验台、健康检查、安全头、三任务路由、腾讯 ASR、Case Top-4、四类确定性规则与错误脱敏全部通过。
- `/api/health`：`appVersion=012`、三任务 `gpt-5.6-terra`、Case `off`、`agent_runs=cloudbase/ready`，无最近写入错误。
- 公网 JS/CSS 与本地 012 构建逐字节一致；标题为“冰箱晚餐 · 今晚的决定”，确认不是旧前端或缓存旧包。
- 公网目标菜单例：`source=model`、`gpt-5.6-terra`、约 26.65 秒、5,662 tokens；合成库存土豆和香菇被识别为已有，去骨鸡腿肉被识别为缺少。

## 已确认延期、素材缺口与开放风险

- 已确认延期：冰箱整理继续只留开发检验台，不进入阶段 2 用户主界面。
- 素材缺口：没有与当前方案诚实匹配的家常成品示例图；后续补素材前不拿回锅肉或种草起点图冒充饭后成品。
- 开放风险：生活记录在模型与缓存都失败时，尚无结构化的可编辑空白/规则草稿兜底；发布前需明确补齐或接受。
- 013 真机已暴露并推动修复两项问题；014 仍需验证 iPhone Safari 与抖音内置浏览器的麦克风允许/拒绝、语音状态、软键盘、动态高度和相机/相册。
- 公网仍是 013；未经用户确认不得上传 014、切流量或推送代码。

## 下一步

1. 用户在 CloudBase 创建 `fridge-dinner-agent-014`，上传版本化 014 包，沿用 013 Secret，并把 `AGENT_APP_VERSION` 改为 `014`；确认 `rightapi.ai` 与显式 provider 配置未回退。
2. 部署成功后先核对 `/api/health`、静态 JS/CSS 和一次合成目标菜请求，再用真实 iPhone 复验“皮卡丘”语音写入、手动输入框、常备确认与统一重规划。
3. 出现 P0 时切回 013，不在生产容器内临时修代码；通过后再记录 014 公网证据与最终包/版本关系。
4. 未经用户明确确认，不推送代码；生活记录完整失败兜底与成品示例素材继续作为后续独立事项。

## 固定真实性边界

- 不保存 API Key、管理员令牌、认证头、原始照片或原始音频。
- 不自动判断过期、变质、气味、熟度或是否安全食用；用户确认始终是前置条件。
- 图片不是冰箱、图片不可用、模型失败与用户确认真实空库存必须保持不同状态。
- 模拟补购始终是尚未真实购买；只有用户明确确认“已拿到”才进入本次可用材料。
- 语音、相机和模型失败都必须有文字、换图、重试或人工确认兜底。
