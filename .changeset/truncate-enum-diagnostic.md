---
"@open-feishu-card/validator": patch
"@open-feishu-card/check": patch
---

枚举类报错不再把整份取值列表塞进一条诊断。

图标 token 有 1167 个，写错一个 token 时 Zod 会把整份枚举拼进 message——实测单条诊断
**25 KB**。这条字符串会进 LSP 诊断、`checkCard()` 返回给调用方/模型的错误、以及日志，
直接把上下文撑爆。

- `validator` 新增导出 `formatIssueMessage(issue)`：枚举类报错只保留前 6 个取值 +
  `… (N options)`；另给所有超长报错加 800 字符兜底（判别联合的整份 tag 列表也在此列）。
  `validateAst()` / `validateData()` 的诊断统一走它。
- `check` 的 `schemaIssue()` 复用同一份截断，`checkCard()` 与 validator 两条路径文案一致。

新增回归用例：非法 `standard_icon.token` 的诊断 < 400 字符且带总数量；普通 schema 错误
不被截断。
