---
"larkard": patch
---

修复 table 的 markdown 单元格换行不撑高整行：

- 真机 `dataType: "markdown"` 的单元格走 `row-item-wrapper--auto`，且没有 `max-height`；文本换行时 td / tr 会跟着长高（`row_height` 只是最小值）。
- 渲染器此前对所有单元格都写 `max-height: 32px; overflow: hidden`，markdown 文本第二行会被裁掉，整行高度不变。现在 markdown 列不再设 `max-height`（`row_height: auto` 时仍受 `row_max_height` 约束）；text / number / options / persons 与 `lark_md` 仍按行高截断。
