---
"@open-feishu-card/optimize": minor
---

新增 `upgradeTextToRichText()`：把 `tag: "plain_text"` 的文本对象升级为 `lark_md`，把普通文本组件 `div` 升级为富文本组件 `markdown`。plain_text 内容默认按官方文档做 HTML 实体转义，保证升级后仍按字面量展示；`div` 的 `text_size` / `text_align` / `lines` / `text_color` / `icon` 等字段会映射到 `markdown` 对应字段，`width` 非 `fill` 或存在无法映射字段时跳过并回报 `skipped`。
