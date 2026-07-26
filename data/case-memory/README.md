# 历史 Case 检索数据

该目录只保存可公开提交的人工构造案例，不包含真实用户隐私数据。

- `reference-cases.json`：24 条独立参考案例，其中同时包含满意正例和明确失败反例。
- `retrieval-labels.json`：8 条结构化检索离线标签，用于 Recall@K 和 MRR 回归。
- `data/eval/planning-cases.json`：仍是独立规划 holdout，不进入检索库。

数据边界：

1. `source=curated` 只表示人工构造并核验，不表示真实线上数据。
2. `satisfaction=rejected` 用于提醒模型避免历史错误，不是用户画像结论。
3. 食材新鲜度、过期和肉类安全不会由图片或历史 Case 自动推断。
4. 检索失败或关闭时必须退回无检索规划链路。
