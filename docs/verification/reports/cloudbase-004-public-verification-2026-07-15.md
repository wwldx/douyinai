# CloudBase 004 公网验收记录

日期：2026-07-15  
地址：`https://fridge-dinner-agent-281751-9-1304313771.sh.run.tcloudbase.com`

## 结论

004 的服务端发布与配置门禁通过。当前可以确认 API Key、腾讯一句话识别和 `terra/sol/terra` 分层模型路由已经应用到默认 HTTPS 地址；真人手机相机、麦克风、移动网络和无痕窗口仍需人工验收。

## 已通过证据

### 严格发布门禁

- `hasApiKey=true`
- `tencentAsrEnabled=true`
- vision：`gpt-5.6-terra`
- planning：`gpt-5.6-sol`
- lifeLog：`gpt-5.6-terra`
- 页面、健康检查、安全响应头、确定性 API 和生产错误脱敏通过。

### 公网 ASR

- `/api/transcribe-audio` 返回 HTTP 200。
- 3.836 秒合成中文音频识别为“今晚想吃番茄牛腩，只有25分钟。”。
- backend：`tencent_sentence_recognition`
- `Server-Timing` 语音阶段约 514ms。
- 10 条 macOS 合成中文做饭约束经公网端点全部满足关键词门禁。

上述 10/10 只证明合成语音、签名、权限、CloudBase 网络和接口解析链路，不是不同说话人、手机麦克风或现场噪声下的准确率。

### 公网真实模型

- 规划用例 `dinner-fast-tomato-eggs`：`gpt-5.6-sol`、`source=model`、约 33.5 秒，通过。
- 重新编码的新哈希冰箱 JPEG：`gpt-5.6-terra`、`source=model`、服务端约 27.5 秒。
- 该视觉请求 usage：2507 input、1226 output、3733 total tokens，其中 reasoning 133 tokens。

缓存冰箱 fixture 在混合 smoke 中返回 `model-timeout-cache`，原因是演示样例命中缓存后按 `DEMO_VISION_CACHE_FALLBACK_MS=4500` 与模型竞速。这是既定现场兜底行为，不计作真实视觉成功，也不说明视觉模型失败。独立非缓存请求用于验证真实视觉链路。

原始混合模型报告：`docs/verification/reports/cloudbase-004-model-smoke-2026-07-15.json`。

## 剩余门槛

1. 真实手机在 Wi-Fi 和移动网络下各完成主流程。
2. 同一手机连续三次录音转写成功，并检查文字可编辑。
3. 拒绝麦克风权限后立即可手动输入，不阻断流程。
4. 后摄像头拍目标菜和冰箱各一次。
5. 无痕窗口完成固定示例，确认不依赖旧站点缓存。
6. 控制台确认 004 承载 100% 流量；提交前演练回滚到 002。
