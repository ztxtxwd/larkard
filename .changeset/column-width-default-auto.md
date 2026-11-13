---
'@open-feishu-card/renderer': patch
---

`column` 未写 `width` 时按内容宽（auto）渲染，不再默认等分撑满。

真机 `Kn()` 在 `width` / `widthValue` 都缺省时返回 `{}`，即 CSS 默认 `flex-grow: 0` + `width: auto`（贴内容宽）；官方文档 `column.width` 的默认值也是 `auto`。渲染器此前把"缺失"当成 `weighted`（`flexBasis:0 + flexGrow`），于是漏写列宽的卡片在预览里被拉成等宽列，和真机对不上。

同时补齐 `widthValue` 的另外两种 echo（此前只认 `pixels`）：

- `column_width_weighted` → `flex-basis:0` + `flex-grow:<value>`
- `builtin_column_width: "auto"` → `width:auto`

新增 4 条用例（RAW 三种 echo + 无 width）与 2 条 DSL 用例（`weighted` / `auto`）。
