---
'@open-feishu-card/components': minor
---

修复 TSX → DSL 转换时布局字段被静默丢弃的问题，使 JSX 重建的卡片与参考 JSON 真机效果一致。

`interactive_container` 此前不输出 `horizontal_align` / `vertical_align` / `horizontal_spacing` / `vertical_spacing`，容器内子组件退化为左上贴边、固定 4px 行距；`column` 丢 `horizontal_align` / `horizontal_spacing`，`column_set` 丢 `vertical_align`；`normalizeIcon` 丢图标 `size`，导致折叠面板箭头等回落到默认 16px；`select_static` 丢组件级 `type` 与选项 `icon`。

`collapsible_panel` 修正 `header.padding` 层级（新增 `headerPadding`），并支持展开态标题 `expandedTitle`（`header.expanded_title`）。

**注意**：`CollapsiblePanel` 的 `padding` 现在只作用于面板本身，不再误写到 `header`。原意是控制标题区间距的用法需改用 `headerPadding`。
