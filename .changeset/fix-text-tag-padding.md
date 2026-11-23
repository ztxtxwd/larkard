---
"larkard": patch
---

修复 `text_tag` 内边距比真机小（header 标签与富文本内联标签）：

- 真机 TextTag 走 size-follow：父字号 ≤18 时标签高 18px（此前误按设计系统裸样式取 16px），
  垂直内边距随之从 3px 恢复到真机的 4px；header 的 `text_tag_list` 走同一规则。
- 父字号 >18 时高度跟随父字号，水平 padding 为 `ceil(父字号 / 4)`，对齐客户端内联样式。
- 行内 top 补偿按新高度重算：正文 14/22 → 2.5px；note 12/20 → 1.5px。
- 字号保持真机截图逐像素实测的 10px（客户端卡片样式表里的 `--universal-card-tag-font-size` 未实际生效）。
