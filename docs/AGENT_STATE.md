# Agent State

更新时间：2026-07-24

状态：CloudBase 013 当前承载公网；015 是最新未部署候选。015 已完成目标菜候选确认、手改菜名来源隔离、语义执行门禁、救援/生活记录执行菜绑定、RightAPI 瞬时 502 恢复与常备确认失败重试。代码、定向回归和部署包已完成；尚未部署、未切流量、未推送 GitHub。

## 当前目标

赛道四「视觉搜索」冰箱晚餐 Agent：用户可从「刷到想吃的菜」或「打开冰箱没想法」进入，经过视觉/语音/文字与人工确认，获得现实可执行的晚餐决定。手机是唯一设计权威，桌面只承载手机画布。

第三轮设计权威仍为 `docs/frontend/012第三轮真正前端重构设计简报-2026-07-20.md`；阶段 2 能力与状态交接见 `docs/frontend/012第三轮-阶段2整体交接-2026-07-23.md`。

## Git 与发布状态

- 分支：`codex/frontend-012`
- 当前 HEAD：`da58758 Prepare CloudBase 014 mobile fix candidate`
- 014 存档：`archive/cloudbase-014-mobile-ui-fix-20260724`（`da58758`），不覆盖。
- 013 修复前存档：`archive/cloudbase-013-pre-mobile-ui-fix-20260724`（`8a3ba41`）。
- 当前工作区是 015 完整候选，包含前端、后端 Schema/Planner/缓存与模型客户端改动；不能只提交 `frontend/`。
- GitHub 发布尚未执行：本机缺少 `gh` CLI，按发布流程需先安装并登录，再提交、推送和建立草稿 PR。

## 015 候选包

- 文件：`dist/deployment/fridge-dinner-agent-cloudbase-015.zip`
- 大小：43,925,233 bytes
- SHA-256：`cae54bf47b97949b7278daa0881c6db082bd55d320a7d592278360542ae8a7e4`
- 通用包 `dist/deployment/fridge-dinner-agent-cloudbase.zip` 与版本包同哈希。
- ZIP 完整性、根目录 Dockerfile 与禁止文件门禁通过；不包含 `.env.local`、Git、`node_modules`、本地用户、本地缓存或密钥。

## 015 产品与契约变化

### 1. Feed 菜名确认

- 拍菜/Feed 路线优先展示主识别和最多 3 个相似候选；选择候选后可直接继续。
- 「都不对，我来改」才展开手动/语音兜底；识别失败时自动进入手动兜底。
- 菜名每次显式保存 `nameSource/nameConfirmed`；手改/语音需再确认后才能进入冰箱。

### 2. 识别材料与菜名来源隔离

- 只有 `vision_primary` 且确认菜名与主识别严格一致时，才能使用原图 `likelyIngredients/imageAnalysis`。
- 选相似候选、手动改名、语音改名和冰箱起点文字/语音都不会沿用原「黄焖鸡」材料清单。
- 派生版本只从当前方案的 `requestSnapshot` 取菜名、库存、时间、来源、先吃与常备确认，不回读当前页面的旧图分析。

### 3. 语义目标与执行门禁

- Planner 新增 `targetAssessment`：`confirmed_food / needs_clarification / non_food / unsafe`。
- Planner 新增 `executionPlan`：实际执行菜名、是否当前可执行、阻断原因与有效步骤。
- 请求菜名与实际执行菜名分离；做法、大字步骤、救援和生活记录只绑定后者。
- 门禁基于整体语义而非关键词黑名单：「鸡屎」被拦截，「鸡屎藤饼」仍可确认为食物；「皮卡丘」需澄清，「皮卡丘造型饭团」可视为食物。
- 旧目标菜方案可查看，但缺新契约时不能直接进入做饭/救援/记录，需重新生成。

### 4. 材料事实与重规划

- 库存、家中常备、模拟待补、本次已拿到和仍缺继续严格分层。
- 食材事实用规范化等值和小范围别名匹配；「油」不能满足「蚝油」。
- 模拟补购不能解锁做饭、救援或记录；只有用户明确确认「本次已拿到」才能进入实际执行。
- 派生请求保留历史「家里没有」快照，但当前规划约束会剔除已拿到或已选模拟补齐的同名项，避免向 Planner 同时传「已补」和「必须继续判缺」。

### 5. RightAPI 瞬时故障恢复

- 2026-07-24 真实手机点击「按这 5 样确认更新方案」后，后端日志连续记录 `/api/plan-target-dish` 502。
- 同等请求定向复现为 `UND_ERR_CONNECT_TIMEOUT`，新域名连通恢复后原请求不改字段即返回 200；因此不是 pantry 契约或新 API 未生效。
- `rightcode_responses_stream` 现在只对连接失败/502/503 在同一总超时内自动重试一次；4xx、JSON 解析错误和整体超时不自动重试。
- 二次均失败时保留当前方案和用户的常备选择，按钮改为「按原确认重试更新」，不伪造新版本。

## 本地配置

`.env.local`（忽略，不提交）已同步：

- `OPENAI_BASE_URL=https://rightapi.ai/codex/v1`
- `RIGHTCODE_CHAT_BASE_URL=https://www.rightapi.ai/draw`
- `AUDIO_TRANSCRIPTION_BASE_URL=https://rightapi.ai/codex/v1`
- `OPENAI_MODEL/VISION_MODEL/PLANNING_MODEL/LIFE_LOG_MODEL=gpt-5.6-terra`
- `AGENT_APP_VERSION=015-local`

本地后端已用该配置重启；`/api/health` 确认 Responses、Chat 和 Audio Base URL 均为 `rightapi.ai`。手机与电脑同一热点时验收入口为 `http://172.20.10.4:5173/`。

## 验证证据

- `node --test demo/agent/modelClient.test.mjs frontend/src/tonight/targetPlan.test.mjs demo/agent/targetDishPlannerAgent.test.mjs`：27/27。
- `npm run check`：通过。
- `npm run showcase:build`：通过，48 modules。
- `npm run cloudbase:package`：通过。
- `git diff --check`：通过。
- 真实模型语义定向：「鸡屎」为 `non_food`，「皮卡丘」为 `needs_clarification`，「鸡屎藤饼」与「皮卡丘造型饭团」均为 `confirmed_food`；非执行态均没有泄漏做法/补购/救援。
- 常备确认等价请求：网络连接超时时返回 502；连通恢复后同请求返回 200，证明请求契约可用。
- 015 仍需公网 CloudBase 和真实 iPhone 复验；本地内置浏览器本轮无法稳定接管局域网页面，不把代码级/截图证据写成真机交互已通过。

## CloudBase 015 必填配置

```env
AGENT_APP_VERSION=015
OPENAI_BASE_URL=https://rightapi.ai/codex/v1
MODEL_PROVIDER=rightcode_responses_stream
RIGHTCODE_CHAT_BASE_URL=https://www.rightapi.ai/draw
OPENAI_MODEL=gpt-5.6-terra
VISION_MODEL=gpt-5.6-terra
PLANNING_MODEL=gpt-5.6-terra
LIFE_LOG_MODEL=gpt-5.6-terra
AUDIO_TRANSCRIPTION_BASE_URL=https://rightapi.ai/codex/v1
```

API Key、腾讯云 Secret 和管理员令牌只放 CloudBase Secret，不进代码包。

## 下一步

1. 安装并登录 GitHub CLI（`gh`）；复核完整 diff 后提交当前工作区，推送 `codex/frontend-012` 并创建草稿 PR 供队友查看。
2. 用 `fridge-dinner-agent-cloudbase-015.zip` 新建 CloudBase 015，不覆盖 014/013；填写上述环境变量。
3. 部署后先查 `/api/health`、静态 JS/CSS 和一条合成目标菜请求，再用 iPhone 复验：候选菜名、手改菜名、常备 5 项更新、模拟补购、救援执行菜和生活记录执行菜。
4. 015 出现 P0 时切回 013；不在生产容器内临时改代码。

## 固定真实性边界

- 不保存 API Key、管理员令牌、认证头、原始照片或原始音频。
- 不自动判断过期、变质、气味、熟度或是否安全食用；用户确认仍是前置条件。
- 图片不是冰箱、图片不可用、模型失败和用户确认真实空库存必须保持不同状态。
- 模拟补购始终是尚未真实购买；只有用户明确确认「已拿到」才进入可用材料。
- 语音、相机和模型失败都必须有文字、换图、重试或人工确认兜底。
