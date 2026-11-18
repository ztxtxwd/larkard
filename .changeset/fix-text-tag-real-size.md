---
"larkard": patch
---

修复 `text_tag` 与真机不一致的字号和左外边距：

- 真机标签使用设计系统 Tag `extra-small` 的 16px 高 / 10px 字 / padding 0 4px（此前误按网页引擎的 size-follow 改成 18px / 12px）。
- 恢复桌面端 `.universal-card-text-tag` 的 `margin: 0 2px`（此前删成了 0）。
- 保留按父行高的垂直居中补偿：`vertical-align:top + top=(父行高-16)/2+0.5`；note 内 12/20 → 2.5px，header 不做补偿。
