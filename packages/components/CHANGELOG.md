# @open-feishu-card/components

## 0.2.0

### Minor Changes

- 79fc9f6: 修复 TSX → DSL 转换时布局字段被静默丢弃的问题，使 JSX 重建的卡片与参考 JSON 真机效果一致。
  
  `interactive_container` 此前不输出 `horizontal_align` / `vertical_align` / `horizontal_spacing` / `vertical_spacing`，容器内子组件退化为左上贴边、固定 4px 行距；`column` 丢 `horizontal_align` / `horizontal_spacing`，`column_set` 丢 `vertical_align`；`normalizeIcon` 丢图标 `size`，导致折叠面板箭头等回落到默认 16px；`select_static` 丢组件级 `type` 与选项 `icon`。
  
  `collapsible_panel` 修正 `header.padding` 层级（新增 `headerPadding`），并支持展开态标题 `expandedTitle`（`header.expanded_title`）。
  
  **注意**：`CollapsiblePanel` 的 `padding` 现在只作用于面板本身，不再误写到 `header`。原意是控制标题区间距的用法需改用 `headerPadding`。

## 0.1.4

### Patch Changes

- `img` 按来源分派字段：`scaleType` 恒定写 `scale_type`；历史 `mode` 仅在本身是缩放值时也写 `scale_type`，尺寸值仍留在 `mode`（旧模板兼容）
- 修正 `crop_top` 落进 `mode` 触发 "img mode is not supported"（回调 200673）

## 0.1.1

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`
