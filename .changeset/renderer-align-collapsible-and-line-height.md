---
"@open-feishu-card/renderer": patch
---

对齐真机：折叠面板描边/内边距/圆角、markdown 行高 +2、列表结构与列表符号

按 feishu-web-dump（网页版 universal-card CSS + 引擎 JS）逐项对账，修四处肉眼可见的偏差：

1. **行高**：真机 Markdown 是 `lineHeight = 引擎行高表(fontSize) + 消息卡片桌面端 2`
   （`de(12)+2=22`、`de(14)+2=24`），此前用「字号 + 8」：带 `text_size` 的段落行距
   一律小 2px，列表逐行累积后差半行。行高也改用引擎 `ce` 表（18→28、20→30 …，
   不再按字号+8 外推），Checker 同样改用该表。
2. **折叠面板描边**：`border.color = grey` 走 `collapsible_panel.border_color` token 表
   → `var(--line-border-component)`（N350 #d0d3d6），不再是正文灰 N600 #646a73。
   `interactive_container` 的 `border_color` 同表（`--bordered` 默认边框一并改 N350）。
3. **折叠面板间距**：新增 `--fat` 类（有描边/底色），header 内边距由写死的 `8px 12px`
   改为 CSS 的 `--fat → 4px 8px`（否则 8px 12px 会盖掉默认值）；content 内边距由
   `0 12px 12px` 改为 `--fat → 8px` / 否则 `padding-top:8px`；默认圆角 8px → `--fat` 6px
   （显式 `corner_radius` 仍优先）；箭头过渡 `.2s → .1s linear`。
   另外内容区改成真机那样**恒为 flex 容器**，默认 `row-gap/column-gap: 8px`
   （`.universal-card-element-shell__container`），多元素面板子项之间才有 8px 间距，
   只有显式写了 `vertical_spacing` / `horizontal_spacing` 才覆盖。
4. **列表**：改为真机结构——每个 item 一个 `<ul>/<ol>` + `<li data-marker>`，
   符号由 `li::before` 画（•/◦/▪ 或序号）、`padding-left:22px`、符号右对齐到距正文 20px。
   原先的 marker span + 6px gap 让符号紧贴文字、缩进只有 11px。

另：卡片根补 `-webkit-font-smoothing: antialiased`（对齐网页版 `html` 规则），
并新增语义色 token（`--line-border-component` / `--text-caption` / `--colorful-blue` …）。
