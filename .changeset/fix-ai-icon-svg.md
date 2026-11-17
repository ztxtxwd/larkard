---
"@open-feishu-card/renderer": patch
---

- `ai-common_colorful`（AI 星芒）改用真机客户端 SVG：字体 glyph `\f128` 在四角星右上角多画一颗小星，渲染出来比真机多一个「右上角小十字」。现在按客户端 `AiCommonColorful` 的 24×24 SVG（#4752E6→#CF5ECF，dark #7B83F7→#B54AB5）以 data URI 画，`theme-dark` 覆盖暗色；同时删掉被它取代的 `background-clip:text` 渐变裁切兜底（`COLORFUL_ICON_GRADIENTS` → `SVG_COLORFUL_ICONS`）。
