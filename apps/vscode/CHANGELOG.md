# Changelog

## 0.2.2

- 预览支持 RAW 自定义颜色：`customBackgroundStyle` / `textStyle.customColor`
- 飞书回读卡片颜色归一化（`normalizeStoredCardColors`）
- header subtitle `lark_md` 渲染修复
- Bundles updated workspace packages (renderer 0.2.8, adapter 0.3.3, compiler/cli/language-server 0.1.8)

## 0.2.1

- Release pipeline now runs from this monorepo (Marketplace tokens live here)
- Bundles updated workspace packages (renderer 0.2.5, compiler, parser, language-server)

## 0.2.0

Source moved from the standalone `lark-card-preview` repo (now archived) into this monorepo (`apps/vscode`). Marketplace ID is unchanged: `TianxiongZhao.lark-card-preview`. Display name is now **Open Feishu Card**.

- Embedded language server: diagnostics, completion, hover, and quick-fix on `*.card` files
- Sanitize command: strip non-standard properties
- Settings and commands use `openFeishuCard.*` (`larkCardPreview.*` still works as aliases)
- Diagnostics no longer attach to ordinary `*.json` files
