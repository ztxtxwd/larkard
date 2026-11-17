---
"larkard": minor
---

首个 `larkard` 版本：把原 `@open-feishu-card/*` 工具链合并为单包多入口。

- 主入口：解析、Schema 校验、最佳实践 lint、发送前检查、净化/编译
- 子入口：`larkard/schema`、`larkard/adapter`、`larkard/renderer`（`/browser`、`/assets`、`/async`）、`larkard/components`、`larkard/optimize`、`larkard/patch`、`larkard/state`
- CLI：`larkard`；LSP：`larkard-language-server`
- 图标 / emoji / 字号行高 / 间距统一由内部 `content` 模块提供；RAW 类型与 Markdown tokenizer 统一在 `adapter`
