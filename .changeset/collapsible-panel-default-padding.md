---
"@open-feishu-card/schema": patch
---

`collapsible_panel` 字段说明补上官方文档未写的默认内边距：

- `header.padding`（标题区）：不写时有默认值——面板带描边或底色（`border` / `background_color` /
  `header.background_color` 任一）为 `4px 8px`，纯无框无色面板为 `0`；显式给出时四边整体覆盖。
- 面板级 `padding`：只落到内容区（`elements`），不影响标题区；不写时内容区默认 `padding-top: 8px`，
  带描边或底色时为四边 `8px`。

依据网页版 universal-card CSS：`.universal-card-collapsible-panel__header` 无 padding 声明，
`--fat` 时追加 `padding:4px 8px`；`.universal-card-collapsible-panel__content` 为
`padding-top:8px`，`--fat` 时 `padding:8px`。渲染器既有实现与该规则一致，本次只补文档与回归测试。
