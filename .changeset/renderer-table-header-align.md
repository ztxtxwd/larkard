---
"@open-feishu-card/renderer": patch
---

修复表格表头对齐：`header_style.text_align` 换值在渲染器里看不出差别。

真机（客户端 table 组件）的表头单元格是 `headerStyle.textAlign` 的 PlainText，列的
`horizontalAlign` 只作用于表体单元格。此前渲染器写成 `column.horizontal_align ||
header_style.text_align`，列的 `horizontal_align` 会整列盖掉表头的 `text_align`——每列都写
`horizontal_align` 的卡片（生成器默认形态）里，改 `text_align` 完全无效。现在：

- 表头对齐只由 `header_style.text_align` 决定；缺省时按列 `data_type` 兜底（`number` → right，其余 left），与真机一致。
- 表体对齐仍以列 `horizontal_align` 为准，缺省同样按 `data_type` 兜底（`number` → right），修正数字列默认靠左的问题。
