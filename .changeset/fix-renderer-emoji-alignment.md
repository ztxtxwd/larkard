---
"larkard": patch
---

修正渲染器里飞书表情的位置与间距：外层改为真机同款 `inline-block + font-size:0 + vertical-align:top`，表情高度等于行高时在行内垂直居中，不再整体偏上；按 inline atom 补 `margin: 0 2px`（连续表情不叠加左边距），与前置文字留出真机一致的间距。表情尺寸同时改为跟随所在 markdown 字号（引擎 `size = 字号 × 1.6`），`text_size=small/heading` 时不再固定为 22.4px；未知短码降级节点新增 `--fallback` 修饰类，避免被 `font-size:0` 吞掉。
