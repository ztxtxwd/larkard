# larkard

飞书卡片（Feishu/Lark Card JSON 2.0）工具链。

仓库包含一个库和两个应用：

| 路径 | 内容 |
| --- | --- |
| [`packages/larkard`](packages/larkard) | 单包多入口的工具链库（解析、校验、发送前检查、RAW ↔ DSL、渲染、TSX、CLI、LSP） |
| [`apps/vscode`](apps/vscode) | VS Code 插件 `Larkard`（扩展 ID 仍为 `TianxiongZhao.lark-card-preview`） |
| [`apps/benchmark`](apps/benchmark) | 大模型卡片生成能力评测（私有） |

库的使用方式、入口表、CLI / LSP 与迁移说明见 [`packages/larkard/README.md`](packages/larkard/README.md)。设计约束见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

- 库源码在 `packages/larkard/src`，测试在 `packages/larkard/test`。
- 真机常量（图标 / emoji / 字号行高 / 间距）在 `src/content`；RAW 类型与 Markdown tokenizer 在 `src/adapter`；发送前检查统一走 `src/core/check.ts`。
- 渲染入口按运行时拆：`src/renderer/index.ts`（SSR）、`browser.ts`、`assets/`、`remote.ts`。

## 发版

见 [`docs/NOTES.md`](docs/NOTES.md)。`larkard` 通过 changesets 发布；VS Code 扩展单独打 tag。
