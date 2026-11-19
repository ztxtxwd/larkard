---
'larkard': patch
---

`checkCard` / `repairDeviceIssues` 新增真机约束 `markdown-font-color`。

飞书发送接口不认块级 `markdown.font_color`，会以 200621
（`unknown property, property: font_color`）整卡拒绝；而它是 Schema 明确支持的
DSL 便利字段（渲染 / adapter 会展开）。现在 `checkCard(dsl, { fix: true })` 会在
发送前把它展开为 content 内的 `<font color='…'>`（与 adapter 的 DSL → RAW 语义一致，
已有内联 `<font color>` 或内容为空时只删除属性），并让 `fixes` 里能查到这条改动；
不带 `fix` 时按 device error 拦截，避免「校验通过却发不出去」。
