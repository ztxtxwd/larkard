---
"@open-feishu-card/renderer": patch
"@open-feishu-card/adapter": patch
---

`img.title` 按真机 BaseText 渲染（此前完全忽略，预览里图片标题丢失）：

**结构 / 样式对齐真机 dump**

- 外壳 `.universal-card-image`（width:100%，承载 margin）+ 上方 `.universal-card-image__title`（`margin-bottom:8px`），与真机 CSS 一致。
- `__wrapper` 补齐 `position:relative / align-items:center / flex:0 1 auto / width:100% / overflow:hidden`；`__host` 补齐 `width:100% / font-size:0 / position:static`（对齐真机 `universal-card-image` 规则）。
- 外边距（含 `margin:8px 20px`、负 margin 出血）挂到外壳上，标题与图片作为整体参与布局，`calc` 宽度照旧。

**文本能力**

- 支持官方 BaseText 的 `plain_text` 与 `lark_md`：`lark_md` 按 markdown 子树渲染（对齐 / 字号 / 粗体等生效）。
- 标题的 `text_size` / `text_color` 折叠进 `textStyle`（等价真机服务端归一）；`lines` / `text_lines` 支持行数截断；空标题不占位。
- RAW ↔ DSL 往返补齐：`rawToDsl` 把图片标题投影成 `plain_text | lark_md` 并保留 `text_size` / `text_color` / `text_align` / `lines`；DSL→RAW 的文本叶子补上 `lines`。
