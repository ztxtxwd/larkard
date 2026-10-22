---
'@open-feishu-card/linter': minor
---

新增规则 `markdown-bold-space`：加粗星号内侧紧贴空格时告警。

模型生成卡片时常写出 `** 分区标题**` / `**分区标题 **`——星号与文字之间有空格，
Markdown 不会加粗，客户端把 `**` 按字面渲染出来。Schema 本身合法，所以放在 linter
（warning）而不是 validator。

覆盖范围：
- `markdown` 组件 `content`
- `plain_text` / `lark_md` / `markdown` 文本对象里 tag 为 `lark_md` / `markdown` 的 `content`
- `table` 中 `data_type` 为 `lark_md` / `markdown` 的列单元格

判定按 CommonMark flanking 规则的简化版：开星号看后一个字符、收星号看前一个字符，
只报星号**内侧**的空格；星号外侧贴空格（`**标题** 正文`）以及文字内部的空格都不报。
行内代码与代码块内的星号会被跳过；`plain_text` 不算 Markdown，不报。
