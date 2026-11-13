---
"@open-feishu-card/schema": minor
"@open-feishu-card/adapter": patch
"@open-feishu-card/renderer": minor
"@open-feishu-card/components": minor
---

补齐 `collapsible_panel` 的 header 字段：

- `schema`：`header.expanded_title` 落地（此前 `parse()` 会静默丢弃）；`header.width` / `header.position` 改为官方枚举；标题文本对象支持 `lark_md` 与 `text_align` / `text_size` / `text_color` / `lines` / `margin` / `icon` / `i18n` 等排版字段。
- `adapter`：RAW→DSL 不再丢弃 `header.width` / `header.vertical_align` / `header.position`（这三项是官方公开字段，丢弃会破坏 RAW ↔ DSL 无损）。
- `renderer`：渲染 `expanded_title`（`details[open]` 时切换标题）、`header.background_color` / `width` / `vertical_align` / `position`，以及面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align`；`expanded` 缺省改为收起（对齐真机）。
- `components`：新增 `headerWidth` / `headerVerticalAlign` / `headerPosition` / `horizontalAlign` / `verticalAlign` / `horizontalSpacing` / `verticalSpacing`。
