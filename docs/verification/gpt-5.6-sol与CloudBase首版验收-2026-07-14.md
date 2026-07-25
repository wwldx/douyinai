# gpt-5.6-sol 与 CloudBase 首版验收

日期：2026-07-14  
范围：CloudBase 001/002 公网冒烟，本地与公网真实 `gpt-5.6-sol` 四端点兼容性小样本  
结论：本地与 CloudBase 兼容性通过，完整质量/成本基线未完成

## 1. CloudBase 001

- 环境 ID：`fridge-dinner-agent-d7bpec7d4611`
- 服务：`fridge-dinner-agent`
- 默认 HTTPS：`https://fridge-dinner-agent-281751-9-1304313771.sh.run.tcloudbase.com`
- 上传包 SHA-256：`a220a5b5d293b0d6ec1d0ab6ace1e57df4fbfff6ca093a5ddd56046b7b1c3506`
- 构建镜像：328MB
- 构建结果：Dockerfile、Vite、Node 22 Alpine 和 ffmpeg 均成功，npm 审计为 0 vulnerabilities。

公网命令：

```bash
REQUIRE_API_KEY=true BASE_URL="https://fridge-dinner-agent-281751-9-1304313771.sh.run.tcloudbase.com" npm run smoke
```

通过项：

- React 展示端和开发检验台。
- `/api/health`：`provider=rightcode_responses_stream`、`model=gpt-5.6-sol`、`hasApiKey=true`。
- `x-request-id`、`nosniff`、`permissions-policy`、限流头和 `server-timing`。
- Case 检索预览 Top-4。
- 非法 JSON 返回脱敏 400，不暴露 stack。

## 2. gpt-5.6-sol 真实小样本

为避免演示缓存干扰，视觉请求使用未登记的文件名，并检查返回 `source=model`。

| 端点 | 结果 | 延迟 | 主要输出 |
|---|---|---:|---|
| `/api/analyze-fridge` | 通过，`source=model` | 38.4s | 16 类可见食材/包装线索，8 个不确定项 |
| `/api/analyze-target-dish` | 通过，`source=model` | 10.9s | “疑似青椒干锅鸡块”及关键材料 |
| `/api/plan-target-dish` | 通过 | 28.2s | 缺鸡肉的黄焖鸡案例返回 `shop_then_cook` |
| `/api/plan-dinner` | 通过 | 24.3s | 快手番茄鸡蛋案例返回 `cook_with_existing_items` |

以上四个端点均成功解析 SSE，并生成符合当前 JSON Schema 的结构化结果。这只能证明接口兼容和小样本可运行，不代表 30 例通过率、真实用户满意度或线上指标。

## 3. 5.5 对照与失败案例

同一张文件名为“黄焖鸡”的菜图：

- 5.6-sol 输出“疑似青椒干锅鸡块”。
- 5.5 对照完成后写入运行时缓存，输出“疑似干锅鸡块”。
- 5.5 请求的 HTTP 响应在 4.5s 时先返回了已有缓存，因此不能把该响应延迟当作 5.5 模型延迟。

该案例说明图片视觉本身存在菜名歧义，也说明文件名和人工缓存标签不是视觉真值。产品上继续保留“用户确认/修改菜名”步骤，评测上需增加多人标注或允许类别集，不应只用文件名精确匹配判错。

## 4. 已发现问题

React 展示端原先为 `/api/plan-target-dish` 设置 15s 超时，但 5.6-sol 实测需要 28.2s。这会导致前端提前展示本地兜底，同时服务端仍完成上游付费请求。前端超时已调整为 60s，并随 CloudBase 002 生效。

## 5. CloudBase 002 公网真实链路

002 切流后，远程首页引用 `/assets/index-Dw_CuKL1.js`，与本地修正后的生产构建一致。

| 端点 | 来源 | 外部总延迟 | 服务端 trace | 结果摘要 |
|---|---|---:|---:|---|
| `/api/analyze-fridge` | `model` | 44.6s | 34.6s | 识别 11 类可见食材/包装线索 |
| `/api/analyze-target-dish` | `model` | 14.7s | 12.1s | “疑似蒜苗回锅肉” |
| `/api/plan-target-dish` | `model` | 20.9s | 20.9s | `cook_now`，15 分钟番茄炒蛋 |
| `/api/plan-dinner` | `model` | 31.1s | 31.0s | `cook_with_existing_items` |

基础冒烟同时通过展示端、开发台、Key/模型健康状态、安全头、Case Top-4 和错误脱敏。这证明 CloudBase 到 Right Code 的真实链路可用，不代表高并发、真机权限或完整 30 例已验收。

## 6. 下一步

1. 查看 Right Code 实际账单，确认本轮请求没有异常放大。
2. 在 20 元受控额度内先跑 5-8 例混合小集，再决定是否扩大到 30 例。
3. 完整基线通过后才运行 V0 / 仅正例 / 正反例 Case 消融。
4. 用真机验证 HTTPS 相机、Web Speech、文本兜底、移动网络和无痕窗口。
5. 回滚演练按用户要求推迟到提交前，当前开发阶段不占用功能与评测时间。
