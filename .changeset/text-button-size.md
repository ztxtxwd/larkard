---
"larkard": patch
---

修复 `type: "text"` 按钮的尺寸分档，对齐真机：

- 真机按钮组件的 `font_size` / `line_height` 对 text 族同样按 `size` 下发，只有 `padding` 例外（`ud__button--text` 固定 `2px 4px`、无最小高度、无描边）。
- 渲染器此前让 text 族跳过 `size` 分档，`size: "small"` 的按钮会回落到 14px / 22px、`padding: 4px 8px`、`min-height: 28px`，实际 32px 高；真机是 12px / 20px、24px 高。
- 现在 `text` / `primary_text` / `danger_text` 也输出尺寸类，并由 text 族规则覆盖 `padding` / `min-height` / 描边，按钮宽度仍为整行、文字靠左。
