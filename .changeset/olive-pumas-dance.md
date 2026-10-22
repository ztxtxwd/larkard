---
'@open-feishu-card/renderer': patch
---

`markdown` 支持前缀图标 `icon`，补齐链路最后一环。

组件库已正确输出 `icon`、adapter 也保留了它，但渲染器只渲染 `property.elements`，`icon` 被整块丢弃——带图标的分区标题在预览里缺图标。

现在支持两种形态：
- `standard_icon`（图标字体，含 `color`）
- `custom_icon`（`img_key` → `<img>`）

未显式给 `size` 时图标跟随文本字号（`small`→12px、`normal`→14px、`heading`→16px），避免回落到固定 16px 与文字不搭。
