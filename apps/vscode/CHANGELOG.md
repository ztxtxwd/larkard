# Changelog

## 0.2.31

- 彩色图标（`*_colorful`）不再渲染成单色：`ud-icons` 字体是单色轮廓，预览里 `ai-common_colorful` 等 AI 图标此前继承 header 标题色（看起来是纯蓝）；现在按真机配色走渐变裁切（AI 系列 `#4752E6 → #CF5ECF`，暗色 `#7B83F7 → #B54AB5`）
- 校验不再误报客户端内置图标：`ai-common_colorful`、`ai-search_colorful` 等 11 个 AI token 与 `approval_colorful` 已收录进图标枚举
- Bundles schema 0.3.3、adapter 0.4.4、renderer 0.8.4、components 0.4.0

## 0.2.30

- 图表对齐真机：预览水合时补齐 VChart 主题内边距 `12/12/12/0`（此前落回缺省 `padding: 20`，四边都偏大）；`chart_spec` 显式写了 `padding` 仍以调用方为准
- Bundles schema 0.3.2、adapter 0.4.4、renderer 0.8.3、components 0.4.0

## 0.2.29

- 宽表格横向滚动条对齐真机：默认隐藏，鼠标移入表格才显示；8px 细条、无两端箭头
- Bundles schema 0.3.2、adapter 0.4.4、renderer 0.8.2、components 0.4.0

## 0.2.28

- 修复表格翻页时「表格/分页器」之间分割线变成 2px 粗线：每页末行去掉底边，避免与翻页器 `border-top` 叠加
- Bundles schema 0.3.2、adapter 0.4.4、renderer 0.8.1、components 0.4.0

## 0.2.27

- 表格参数按官方 JSON 2.0 文档补全：`date` 日期列（含 `date_format`）、`freeze_first_column` 冻结首列、`vertical_align`、`number` 的 `symbol`/`separator`/`precision`、`markdown` 图片、空单元格 `--`、列宽/行高/page_size 范围夹紧
- 翻页器对齐真机：翻页区位于表格同一道边框内，按钮无描边/底色（仅 hover），箭头为上/下
- Bundles schema 0.3.2、adapter 0.4.4、renderer 0.8.0、components 0.4.0

## 0.2.26

- 表格分页：预览里 `page_size` 按真机缺省 5 行/页，支持翻页；单页不显示翻页器（对齐 antd small pagination 的「当前/总页数 + 上下页」）
- Bundles schema 0.3.2、adapter 0.4.3、renderer 0.7.0、components 0.4.0

## 0.2.25

- Audio 组件补齐真机属性：`style`（normal/flat/speak 图标）、`time_display` × `time_position`（单/双时间槽，≥1h 自动 `HH:MM:SS`）、`border`、`margin` / `padding`、`background_style` / `fill_color`、`width`、`disabled` 半透明蒙层、`fallback`
- Bundles schema 0.3.2、adapter 0.4.3、renderer 0.6.0、components 0.4.0

## 0.2.24

- 表格列线（`th`/`td` 右边线）改用 `--line-divider-default`（`rgba(31,35,41,.15)`）：半透明中性黑叠在单元格底色上，表头列线叠 `#f2f3f5` → `(211,211,214)`（真机取色 `#d4d4d7`），表体列线叠白 → `(222,222,223)`。此前用 `--bg-filler` 实色 `#eff0f1`，比真机浅两档且偏蓝，表头看起来像一条发白的蓝灰线
- Bundles schema 0.3.2、adapter 0.4.2、renderer 0.5.8、components 0.4.0

## 0.2.23

配色对齐客户端 light token 表（feishu-web-dump 对账），修掉「整体比真机偏蓝」的几处来源：

- 面板底色 `--bg-float-overlay` 回实色 `#f5f6f7`（客户端 token `rgb(245,246,247)`，与 `grey-50` 同值）。0.2.22 按 JPEG 真机截图量到 (246,246,246) 改成的中性 4% 叠色是误判：JPEG 色度子采样会把 `#f5f6f7` 压成中性 246；无损真机 PNG 实测仍是 (245,246,247)
- 分割线 / 表格行线改走 `--line-divider-default`（`rgba(31,35,41,.15)`，叠白 `(222,222,223)`）：`hr`、`collapse_divider`、引用块竖线、表格 `th/td` 底边不再写死 `#dee0e3`（蓝通道多 4 阶）；表格列线改用 `--bg-filler`（`#eff0f1`）
- 表格表头：`header_style.background_style=grey` 由 `#f5f6f7` 改为 `#f2f3f5`（真机 token `udtoken-table-bg-head` = N100）；支持 `header_style.text_color` / `text_size` / `lines`（`text_color=grey` → `#646a73`，此前一律写死 `#1f2329` 深蓝黑）
- 行内代码 / 代码块的底色与边框按真机 token；暗色主题 `--bg-float-overlay` `#373737`、`--line-divider-default` `rgba(207,207,207,.15)`
- 折叠面板默认内边距写进 schema 字段说明（标题区 `--fat` 4px 8px、否则 0；内容区 `padding-top:8px`、`--fat` 8px）
- Bundles schema 0.3.2、adapter 0.4.2、renderer 0.5.7、components 0.4.0

## 0.2.22

预览样式对齐真机（feishu-web-dump 对账），四处肉眼可见的差异：

- 折叠面板描边：`border.color=grey` 走 `collapsible_panel.border_color` token 表 → `var(--line-border-component)`（N350 `#d0d3d6`），不再是正文灰 N600（此前边框深一整档）；`interactive_container` 的 `border_color` 同表
- 折叠面板间距/圆角：新增 `--fat`（有描边/底色）——header `4px 8px`、content `8px`、圆角 `6px`（显式 `corner_radius` 优先）；内容区恒为 flex 容器并带 8px 行距，多元素面板不再贴死
- markdown 行高：改用引擎行高表 + 消息卡片桌面端 `+2`（`de(12)+2=22`、`de(14)+2=24`，此前用「字号 + 8」漏了 +2，带 `text_size` 的段落/列表行距少 2px，列表逐行累积差半行）
- 列表：改为 `ul/ol + li[data-marker]`，项目符号由 `li::before` 画（•/◦/▪ 或序号）、`padding-left:22px`、符号右对齐到距正文 20px、颜色 `var(--colorful-blue)`
- 面板底色 `--bg-float-overlay` 改客户端那套中性 4% 叠色（`rgba(30,30,30,.04)` → 叠白 `#f6f6f6`，与真机实测 (246,246,246) 逐通道一致；此前是 `#f5f6f7` 偏蓝一阶）
- Bundles schema 0.3.1、adapter 0.4.2、renderer 0.5.6、components 0.4.0

## 0.2.21

- `img.title` 图片标题按真机 BaseText 渲染（支持 `plain_text` / `lark_md`，字号 / 颜色 / 对齐 / 行数截断生效，此前完全忽略）
- 分栏 `flex_mode` 改为只在窄屏（卡片容器 ≤320px）覆盖列宽，对齐真机 `isWide`：宽屏下 `width` / `weighted` 照常生效；`stretch` 窄屏改为每列独占一行堆叠（此前把列强行改成 100% 却不换行，1:2 的 weighted 列会被压成 1:1）
- `column` 宽度对齐真机：未写 `width` 时按内容宽（auto）；px 只认 16–600，越界按 auto；整行超宽时按 px 比例等比压缩
- RAW→DSL 保留 `column.widthValue` 的真实权重，`weighted` 1:2 的列在预览里不再变成 1:1
- `flow` 窄屏列宽回落 auto；新增 linter 提示 `column-width-range` / `column-weight-range`
- 各组件补齐 `hover_tips` / `disabled_tips`：`button`、`video`、`interactive_container`、`checker`、`select_img`
- Bundles schema 0.3.1、adapter 0.4.2、renderer 0.5.4、components 0.4.0

## 0.2.20

- 折叠面板（`collapsible_panel`）补齐 header 字段：`expanded_title`（展开 / 收起切换标题）、`width`、`vertical_align`、`position`、`background_color`；面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align` 生效；`expanded` 缺省改为收起（对齐真机）
- `column` 的 `horizontal_align` / `direction` 与 `horizontal_spacing` 在预览里生效；`column_set.vertical_align` 不再生效（真机 `disableVerticalConfig`，需写到每个 `column` 上）
- Bundles schema 0.3.0、adapter 0.4.1、renderer 0.5.0、components 0.4.0

## 0.2.19（补记）

- Bundles renderer 0.2.28、adapter 0.3.18、schema 0.1.7

## 0.2.18

- 预览里的默认按钮按真机撑满整行，纯文字按钮文字靠左
- Bundles renderer 0.2.27

## 0.2.17

- 读卡 / 预览链路保留 open_url 的 pc_url / ios_url / android_url（复制按钮 `lark://client/core/copy` 不再丢失）
- Bundles adapter 0.3.13、renderer 0.2.22

## 0.2.16

- 支持搭建工具 / miaoka 导出的 `{ name, dsl, variables }` 文档：校验与净化作用于 `dsl`，写回保留外层
- 修复内嵌 LSP 在卡片含中文时静默失效：stdio Content-Length 改为按 UTF-8 字节分帧

## 0.2.15

- `.card` 默认改为文本编辑器 + 侧边实时预览（`preview.openOnSide`），自定义整页预览改为可选，避免挡住 Schema 诊断 / 补全 / Hover / Quick Fix

## 0.2.14

- 修复正文 `<font color='white'>` 白字渲染失败（紫底等深色容器上显示成黑字）
- Bundles renderer 0.2.20

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
