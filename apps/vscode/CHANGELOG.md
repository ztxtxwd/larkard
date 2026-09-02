# Changelog

## 0.2.13

- 修复图片 `margin` 未生效导致正文图左右贴边
- Bundles renderer 0.2.19

## 0.2.12

- 去掉 `interactive_container` 默认圆角，未声明 `corner_radius` 时对齐真机直角
- Bundles renderer 0.2.18

## 0.2.11

- 对齐官方 schema：新增 avatar / collapse_divider / fallback_text 预览，日期与人员选择器静态框
- Bundles schema 0.1.5、adapter 0.3.12、renderer 0.2.17

## 0.2.10

- 折叠面板标题色对齐真机 caption（`N600`）
- Bundles renderer 0.2.16

## 0.2.9

- 预览对齐真机：图标定宽高、块外边距、`collapsible_panel` 的 `follow_text` 与默认无边框；`config.style.color` 支持 `mm_*` 等任意登记色
- Bundles adapter 0.3.11、renderer 0.2.15

## 0.2.8

- 修复 `interactive_container` / `collapsible_panel` 自定义色（`cus-*`）背景不显示
- Bundles adapter 0.3.10、renderer 0.2.14

## 0.2.7

- Bundles renderer 0.2.13：独立预览 root 边框对齐飞书网页版 `--line-border-card`（`var(--N300)`）

## 0.2.6

- `normalizeStoredCardColors` 补齐 `interactive_container` 背景色归一化，修复嵌套容器 cus-bg 序号冲突
- Bundles updated workspace packages (adapter 0.3.9, compiler/cli/language-server 0.1.13)

## 0.2.5

- 预览对齐真机布局：body padding 0 无白边、interactive_container 纵向间距与仅可点击时 pointer
- RAW→DSL 修复列表色丢失、bg/text alias 串台、config.summary 与边框色归一化
- Bundles updated workspace packages (adapter 0.3.8, renderer 0.2.12, compiler/cli/language-server 0.1.12)

## 0.2.4

- dslToRaw 展开 `config.style.color` 的 `cus-*` 自定义色，修复预览 KPI 背景与强调色/说明文字渲染
- Bundles updated workspace packages (adapter 0.3.6, renderer 0.2.11, compiler/cli/language-server 0.1.11)

## 0.2.3

- RAW→DSL 自定义文字色：写入 `config.style.color`，用 `font_color` 引用别名，不再内联 `#hex`
- Bundles updated workspace packages (adapter 0.3.4, renderer 0.2.9, compiler/cli/language-server 0.1.9)

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
