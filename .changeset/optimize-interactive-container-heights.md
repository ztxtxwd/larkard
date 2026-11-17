---
"@open-feishu-card/optimize": minor
---

新增 `@open-feishu-card/optimize`：发送前视觉优化。首个能力是分栏内交互容器等高——按真机字号 / 行高 / padding / margin / 折行规则预测每个 `interactive_container` 的自然高度，取列间最大值后写回 `height`，避免真机上各列参差不齐。
