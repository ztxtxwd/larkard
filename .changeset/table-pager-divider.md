---
"@open-feishu-card/renderer": patch
---

table：修复翻页时表格与分页器之间的分割线显示为 2px 粗线的问题。

翻页时 DOM 最后一行并不是可见的最后一行（后面还有 hidden 行），`tbody tr:last-child` 的去底边规则失效；可见页尾行的 `border-bottom` 与翻页器的 `border-top` 叠在一起。现在每页最后一行加 `--page-last` 类并去掉底边，分割线恢复为真机的 1px。
