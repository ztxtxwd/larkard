# larkard

## 0.1.2

### Patch Changes

- 57e8402: 渲染 markdown 时还原 `escapeMarkdown()` 写入的 HTML 实体：`parseInline` 产出的 `plain_text` 文本节点现在会把 `&#45;`、`&#42;`、`&amp;` 等还原成字面量，修复 `upgradeTextToRichText` 升级后的卡片在渲染器里直接显示 `&#45;` 的问题。行内代码与代码块保持原样（CommonMark 不在 code span 里解码实体）。

## 0.1.1

### Patch Changes

- e9ec8c7: 修复 `larkard/patch` 与 `larkard/state` 子路径的类型入口：`exports` 原先指向不存在的 `dist/patch/index.d.ts` / `dist/state/index.d.ts`，而 `tsc` 实际把声明生成在 `dist/core/patch/index.d.ts` / `dist/core/state/index.d.ts`，导致下游 TypeScript 报 TS7016（隐式 any）。运行时入口不变。

## 0.1.0

### Minor Changes

- eb13dfc: 首个 `larkard` 版本：把原 `@open-feishu-card/*` 工具链合并为单包多入口。
  
  - 主入口：解析、Schema 校验、最佳实践 lint、发送前检查、净化/编译
  - 子入口：`larkard/schema`、`larkard/adapter`、`larkard/renderer`（`/browser`、`/assets`、`/async`）、`larkard/components`、`larkard/optimize`、`larkard/patch`、`larkard/state`
  - CLI：`larkard`；LSP：`larkard-language-server`
  - 图标 / emoji / 字号行高 / 间距统一由内部 `content` 模块提供；RAW 类型与 Markdown tokenizer 统一在 `adapter`

飞书卡片 JSON 2.0 工具链。首个版本把原 `@open-feishu-card/*` 系列合并为单包多入口；
旧包的发布历史保留在 git 历史与 npm 上。
