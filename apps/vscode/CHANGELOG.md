# Changelog

## 0.2.1

- Release pipeline now runs from this monorepo (Marketplace tokens live here)
- Bundles updated workspace packages (renderer 0.2.5, compiler, parser, language-server)

## 0.2.0

Source moved from the standalone `lark-card-preview` repo (now archived) into this monorepo (`apps/vscode`). Marketplace ID is unchanged: `TianxiongZhao.lark-card-preview`. Display name is now **Open Feishu Card**.

- Embedded language server: diagnostics, completion, hover, and quick-fix on `*.card` files
- Sanitize command: strip non-standard properties
- Settings and commands use `openFeishuCard.*` (`larkCardPreview.*` still works as aliases)
- Diagnostics no longer attach to ordinary `*.json` files
