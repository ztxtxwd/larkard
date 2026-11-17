---
"@open-feishu-card/schema": minor
"@open-feishu-card/language-server": patch
---

feat(schema): 将 note 备注组件纳入 Schema 2.0

官方 2.0 文档标注废弃 note，但客户端引擎仍保留渲染与 RAW 回读（`is_footer` 等字段会下发）。新增 `NoteSchema` / `NoteChildSchema`（图标、图片、文本、富文本子项）并加入 `ElementSchema` 判别联合，`language-server` 的 tag 补全同步支持 `note`。
