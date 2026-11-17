---
"larkard": patch
---

渲染 markdown 时还原 `escapeMarkdown()` 写入的 HTML 实体：`parseInline` 产出的 `plain_text` 文本节点现在会把 `&#45;`、`&#42;`、`&amp;` 等还原成字面量，修复 `upgradeTextToRichText` 升级后的卡片在渲染器里直接显示 `&#45;` 的问题。行内代码与代码块保持原样（CommonMark 不在 code span 里解码实体）。
