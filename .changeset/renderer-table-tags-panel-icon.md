---
"@open-feishu-card/renderer": patch
---

对齐真机表格标签与折叠面板箭头：

- table `options` 标签改用客户端的 `<color>_table` 色板（X100 实心底 + text-title 深色字、20px 高 / 14px 600 字、胶囊圆角），不再复用正文 text_tag 的半透明色板；选项值支持官方文档里的单个字符串，以及 `text` 为 plain_text 节点/嵌套对象的写法，不再出现空标签或 `[object Object]`。
- `collapsible_panel` 箭头默认尺寸按标题字号计算（真机 `j(cr(title.textStyle))`：12px→14px、14px→16px、16px→18px），并支持 RAW 的 `widthValue`/`heightValue` 像素尺寸；之前一律回退 16px，标题字号偏小时箭头比真机大。
