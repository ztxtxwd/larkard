---
"@open-feishu-card/renderer": patch
---

table：宽表格的横向滚动条对齐真机——默认透明隐藏，鼠标移入表格才显示；滚动条改为 8px 细条，隐藏两端箭头按钮。Firefox 走 `scrollbar-color`，WebKit/Blink 走 `::-webkit-scrollbar`。
