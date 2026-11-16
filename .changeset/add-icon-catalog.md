---
"@open-feishu-card/schema": minor
---

新增子路径 `@open-feishu-card/schema/icon-catalog`：图标目录（风格分组 + 官方分类）。

- `ICON_CATALOG`：`outlined` / `filled` / `colorful` 三套风格，13 / 13 / 5 个官方分类，
  共 1167 个 token，与 `icon-tokens.list.ts` 严格一一对应（新增回归用例：不重、不漏、不多，
  且每个 token 的后缀与所在风格一致）。
- `ICON_STYLES`：风格 tab 的文案与顺序（线性 / 面性 / 彩色）。
- `iconStyleOf()` / `iconCategoryOf()`：token → 风格 / 分类，用于把图标选择器定位到当前值。
- 子路径**不 import zod**：编辑器只引这份纯数据，不会把整套 Zod schema 拖进浏览器包；
  主入口保持原样未收录目录数据，`@open-feishu-card/schema` 的体积不变。
