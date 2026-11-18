---
"larkard": minor
---

adapter / renderer：markdown 支持更多官方内联 HTML 标签，RAW ↔ DSL 往返补齐。

- `parseMarkdown` / `parseInline` 识别 `<number_tag>`、`<local_datetime>`、`<link>`、`<a href>`、`<br>`、`<hr>`；显式 `<br>` 后紧跟的换行不再叠加空行。
- RAW → markdown 投影：`number_tag` / `local_datetime` 不再丢角标外壳，`link` 携带 icon 或多端地址时输出 `<link>` 标签而不是纯 `[text](url)`。
- 渲染器：`link` 支持前缀图标；`number_tag` 支持 `background_color` / `font_color` 自定义颜色。
