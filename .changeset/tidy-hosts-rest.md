---
'larkard': patch
---

修复正文省略 `vertical_spacing` 时封印宿主抵错间距：

- 客户端 `.universal-card-body` 的默认 `row-gap` 是 12px，8px 只是 `column_set` / 嵌套容器的缺省值。
- `card_prog` / `card_state` 宿主的负上外边距此前用 `DEFAULT_SPACING_PX`(8px) 兜底，正文没显式写 `vertical_spacing` 时每个宿主漏 4px，两个宿主让水印离卡片底边比普通卡多 8px。
- 现在省略或回显 `"default"` 时按 body 默认 12px 计算；显式间距与未知 token 的行为不变。
