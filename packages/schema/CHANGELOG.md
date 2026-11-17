# @open-feishu-card/schema

## 0.5.1

### Patch Changes

- 24e2431: `corner_radius` 只接受**单个** px 或百分比值（飞书不支持 CSS 四角简写）。
  
  - `schema`：新增 `CornerRadiusSchema`（单个 px / 百分比值；空字符串保留为编辑器「未设置」的回读形态），替换 `img` / `img_combination` / `interactive_container` / `audio.border` / `collapsible_panel.border` 的自由字符串；`"8px 0 0 8px"` 这类多值现在会校验失败。
  - `renderer`：圆角统一走 `normalizeCornerRadius()`，多值 / 非法值不输出 `border-radius`，预览不再比真机「更能画」。
  - `check`：新增真机规则 `corner-radius-domain`：`8px 8px 8px 8px` 这类四角全等的简写自动折叠为 `8px`；各角不同没有唯一正确解，只报错不修。
  - `components`：`cornerRadius` 类型收窄为 `` `${number}px` | `${number}%` ``。

## 0.5.0

### Minor Changes

- b8529f2: 新增子路径 `@open-feishu-card/schema/icon-catalog`：图标目录（风格分组 + 官方分类）。
  
  - `ICON_CATALOG`：`outlined` / `filled` / `colorful` 三套风格，13 / 13 / 5 个官方分类，
    共 1167 个 token，与 `icon-tokens.list.ts` 严格一一对应（新增回归用例：不重、不漏、不多，
    且每个 token 的后缀与所在风格一致）。
  - `ICON_STYLES`：风格 tab 的文案与顺序（线性 / 面性 / 彩色）。
  - `iconStyleOf()` / `iconCategoryOf()`：token → 风格 / 分类，用于把图标选择器定位到当前值。
  - 子路径**不 import zod**：编辑器只引这份纯数据，不会把整套 Zod schema 拖进浏览器包；
    主入口保持原样未收录目录数据，`@open-feishu-card/schema` 的体积不变。

## 0.4.0

### Minor Changes

- c45693a: `IconTokenSchema` 改为由仓库内清单 `src/common/icon-tokens.list.ts`（`ICON_TOKENS`，1167 个）生成，能通过校验的 token 与清单严格一一对应：
  
  - **新增 13 个**前缀图标 token：`chat-loading_outlined`、`feishuclip_filled`、`headphone-solid_outlined`、`inline-view_outlined`、`jira-filter_outlined`、`original_outlined`、`port-export_outlined`、`rename_outlined`、`trello_outlined`、`up-top-round_outlined`、`meeting-ai_filled`、`calendar-disable_colorful`，以及 `ai-common_colorful`（此前只作为客户端补充，现已在清单内）。
  - **移除 10 个**不在清单内的客户端私有 AI token（`ai-search_colorful`、`ai-doc_colorful`、`ai-video_outlined`、`ai-update_filled` 等）。这些 token 在客户端字体里存在，但不在有效值清单里，现在与臆造 token 一样被判非法——若既有卡片用到，需要换成清单内的图标。
  - **renderer**：`COLORFUL_ICON_GRADIENTS` 同步收敛到 `ai-common_colorful`，不再为已移除的 AI 彩色图标注入渐变。
  - **validator**：新增回归用例——清单内 token 全部通过校验、清单外 token（含被移除的 AI 图标）报错，且 `IconTokenSchema.options` 与 `ICON_TOKENS` 严格相等。

## 0.3.3

### Patch Changes

- 7624ccc: 修复彩色图标（`*_colorful`）的两处不一致：
  
  - **schema**：`IconTokenSchema` 补上客户端内置的 AI 图标（`ai-common_colorful`、`ai-search_colorful` 等 11 个）与官方文档里漏收的 `approval_colorful`，避免合法卡片被校验判为非法。
  - **renderer**：这些彩色图标在真机上是自带渐变的彩色图形，而 `ud-icons` 字体是单色轮廓（原始 woff2 无 COLR/CPAL），此前会继承父级颜色（header 里就是模板蓝）。现在命 `COLORFUL_ICON_GRADIENTS` 的 token 改用 `background-clip:text` 渐变着色（AI 系列：`#4752E6 → #CF5ECF`，暗色 `#7B83F7 → #B54AB5`），header 也不再给彩色图标注入标题色。

## 0.3.2

### Patch Changes

- 12328f1: `collapsible_panel` 字段说明补上官方文档未写的默认内边距：
  
  - `header.padding`（标题区）：不写时有默认值——面板带描边或底色（`border` / `background_color` /
    `header.background_color` 任一）为 `4px 8px`，纯无框无色面板为 `0`；显式给出时四边整体覆盖。
  - 面板级 `padding`：只落到内容区（`elements`），不影响标题区；不写时内容区默认 `padding-top: 8px`，
    带描边或底色时为四边 `8px`。
  
  依据网页版 universal-card CSS：`.universal-card-collapsible-panel__header` 无 padding 声明，
  `--fat` 时追加 `padding:4px 8px`；`.universal-card-collapsible-panel__content` 为
  `padding-top:8px`，`--fat` 时 `padding:8px`。渲染器既有实现与该规则一致，本次只补文档与回归测试。

## 0.3.1

### Patch Changes

- 6216759: 按真机（V7.4+，PC + iOS 实测）对齐 `column` 宽度语义，并修掉 `flex_mode: stretch` 的布局 bug。
  
  **renderer**
  
  - `flex_mode` 的列宽覆盖改为**窄屏才生效**，与客户端 `ni()` 一致（`isWide`：卡片容器
    > 320px 时把 flexMode 当 `none`）：column_set 挂 `--stretch/--bisect/--trisect/--flow`
    类，宽度覆盖与 `flex-wrap: wrap` 放进 `@container (max-width: 320px)` 规则里。
    宽卡预览下 `width` / `weighted` 照常生效（对齐 PC 真机），窄卡片里才堆叠/等分。
  - 修掉 `stretch` 的布局 bug：此前只把列改成 `width:100%` 却不换行，px 列又带
    `flex-shrink: 0`，于是它吃掉整行、把兄弟列压成 0（典型现象：stretch + `width:"16px"`，
    16px 列变成整行宽）。现在窄屏每列独占一行。
  - px 列不再写 `flex-shrink: 0`：真机在整行超过卡片内容宽时会**按 px 比例等比压缩**
    （600px 的行放进 576px 内容区 → 缩到 576），定死不缩会溢出卡片。
  - `flex_mode: flow` 在窄屏下把列宽回落 `auto`（客户端 `ei()` 同款）：px / weighted
    都被忽略、按内容宽排列；此前预览里 px 仍然生效。
  - px 超出 `[16,600]`（如 `10px` / `800px`）按 `auto` 渲染：真机既不报错也不夹取，直接当内容宽。
  
  **linter**
  
  - 新增 `column-width-range`：px 越界时提示客户端会忽略该值、退回 `auto`。
  - 新增 `column-weight-range`：`weight` 不是 1–5 的整数时提示该列会降级成 `auto`，
    同行其它 `weighted` 列分掉剩余宽度。
  
  **schema**
  
  - `column.width` / `weight` 的描述补充真机语义：px 不是绝对宽度（整行超宽会等比压缩）、
    越界值会被静默忽略、`flex_mode` 只在窄屏覆盖 `width`。

## 0.3.0

### Minor Changes

- 42fb7bd: 补齐 `collapsible_panel` 的 header 字段：
  
  - `schema`：`header.expanded_title` 落地（此前 `parse()` 会静默丢弃）；`header.width` / `header.position` 改为官方枚举；标题文本对象支持 `lark_md` 与 `text_align` / `text_size` / `text_color` / `lines` / `margin` / `icon` / `i18n` 等排版字段。
  - `adapter`：RAW→DSL 不再丢弃 `header.width` / `header.vertical_align` / `header.position`（这三项是官方公开字段，丢弃会破坏 RAW ↔ DSL 无损）。
  - `renderer`：渲染 `expanded_title`（`details[open]` 时切换标题）、`header.background_color` / `width` / `vertical_align` / `position`，以及面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align`；`expanded` 缺省改为收起（对齐真机）。
  - `components`：新增 `headerWidth` / `headerVerticalAlign` / `headerPosition` / `horizontalAlign` / `verticalAlign` / `horizontalSpacing` / `verticalSpacing`。
- 42fb7bd: `column` 的 `horizontal_align` / `direction` 在预览里生效；`column_set` 的 `vertical_align` 明确废弃。
  
  **background**：对齐字段在真机上由网页版引擎的同一个 `qr()` 产出，规则是
  
  - `isRow = direction === 'horizontal'`
  - `horizontal_align` → `isRow ? justify-content : align-items`
  - `vertical_align` → `isRow ? align-items : justify-content`
  
  但 `column_set` 调用时带了 `disableVerticalConfig: true`（`chunks` 里就是这一句），垂直对齐整段被跳过；官方《分栏》文档的 `column_set` 字段表同样没有 `vertical_align`。反过来的 `column` 两个对齐都吃，只是 `horizontal_align` 受 `unifyLayout` 开关控制。
  
  **renderer**
  
  - `column` 此前写死 `flex-direction: column`，只把 `vertical_align` 塞给 `justify-content`，`horizontal_align` 与 `direction` 完全没人读——于是「列内水平对齐」在预览里怎么点都不动，`direction: horizontal` 也永远排成竖列。
    现在按上面的规则映射，并补上 `horizontal_spacing → column-gap`（只在显式给值时输出，与真机一致）。
  - `column_set` 忽略 `vertical_align` 的行为保留，加注释说明这是真机语义（`disableVerticalConfig`），不要再"修"。
  - 新增 7 条用例锁定上述映射（含 RAW camelCase 与 `column_set` 忽略垂直对齐）。
  
  **schema**
  
  - `ColumnSetSchema` 去掉 `vertical_align`：真机不认，留着只会让模型生成一个静默失效的字段。需要列内容垂直居中写 `column.vertical_align`。
  - `ColumnSetSchema` 的 describe 同步纠正（原文案推荐在 `column_set` 上写 `vertical_align=center`，是错的）。
  
  **components**
  
  - `ColumnSetProps` 去掉 `verticalAlign`，`renderColumnSet` 不再输出 `vertical_align`（`FeishuColumnSet` 类型本就没有这个字段）。垂直居中改用 `Column` 的 `verticalAlign`。

## 0.2.0

### Minor Changes

- bdd86c4: 补齐 `img_combination` / `select_img` 全链路支持。
  
  - **schema**：`img_combination.img_list` 支持官方字段 `img_id` / `transparent`；`select_img.options` 支持 `img_id` / `transparent`。
  - **adapter**：RAW ↔ DSL 双向映射——`combinationMode` / `imgList` / `cornerRadiusValue` / `transparent` ↔ `combination_mode` / `img_list[{img_key}]` / `corner_radius` / `combination_transparent`；`select_img` 的 `options[].imageID` → `img_key`、camelCase 配置 → snake_case、RAW `actions` → `behaviors`；`dslToRaw` 反向生成渲染器可用的 RAW 形态。
  - **components**：`ImgCombination` 的图项支持 `imgId` / `transparent`；`SelectImg` 选项支持 `imgId` / `transparent` / `disabledTips` / `hoverTips`，组件级支持 `disabledTips`。
  - **renderer**：新增 `img_combination`（double / triple / bisect / trisect 布局）与 `select_img`（网格、选中/禁用态、表单内 checkbox/radio）渲染，样式对齐网页版引擎；`form` 渲染子元素时注入 `inForm` 上下文。

## 0.1.10

### Patch Changes

- d14e395: 修正 `escapeMarkdown` 二次转义：此前逐字符多遍替换，后面转 `#` 时会把前面生成的实体再转一遍（`**` 变成 `&&#35;42;&&#35;42;`，卡片上显示乱码）。改为单遍替换，每个字符只转义一次。

## 0.1.9

### Patch Changes

- 3dee401: 回调行为不再在 RAW↔DSL 往返中丢失（服务端回读形态是 `action_request`，不是 `callback`）。
  
  `im.message.get?card_msg_content_type=raw_card_content` 返回的回调 action 实际形态是
  `{ type:'action_request', action:{ actionID, isValueObjectType, value:"" } }`。此前 raw→DSL 只认
  `callback`，服务端返回的 action 全部落进 `return undefined`，整条 action（含 `behaviors` 字段）
  静默消失；`interactive_container` 的 `value ?? {}` 还会把 `""` 原样透传成字符串。
  
  **adapter**
  - `button` / `interactive_container` / `column_set` / `column` 的 RAW `actions` 收成共用投影函数，
    `callback` 与 `action_request` 两种拼写都认。
  - `value` 归一：对象原样保留；非空字符串保留（服务端接受字符串载荷）；被服务端清空
    （`isValueObjectType` / `actionID`）时投影为 `{}`，字符串空载荷保留 `""`。
  - 未知 action type 不再静默丢：按 snake_case 原样保留进 `behaviors`。
  - 新增可选诊断通道 `rawToDsl(raw, { onWarn })` / `rawCardToDsl(env, { onWarn })`，报告
    `unknown_action_type`（未知 type）与 `callback_payload_cleared`（载荷被服务端清空）、
    `unrepresentable_action`（column_set/column 的公开 schema 放不下回调）。
    不传 `onWarn` 时行为与输出不变。
  - DSL→RAW 输出服务端拼写：回调写 `type:'action_request'`，平台 URL 写
    `pc_url` / `ios_url` / `android_url`（raw→DSL 两种拼写都收，往返不变）。
  
  **schema / components**
  - `CallbackBehavior.value` 放宽为 `record | string`（服务端接受字符串载荷）。
  
  **renderer**
  - `readCallbackValue` 同时识别 `action_request`；`resolveURL` 同时认 snake_case 平台 URL。
  
  注意：即使投影正确，从「拉一张卡 → 再发出去」这条路上回调参数仍会为空——服务端两种回读形态
  （raw 的 `value:""` / user_card_content 的 `{type:'callback'}`）都不回显载荷。要保住 `value`，
  发送侧必须留存原始 DSL。

## 0.1.6

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`

## 0.1.5

### Patch Changes

- 对齐官方 card-schema（P0/P1）：新增 `avatar`、`picker_date`、`fallback_text`、`collapse_divider` 组件
- 交互件补齐 `disabled_tips` / `value` / `required`；`overflow`、`select_img`、`person_list`、`header` 等公开字段
- `markdown.enable_streaming` / `text_lines`、`img.fallback_img_key`、`UdIconSchema` 支持 `tag: ud_icon`

## 0.1.4

### Patch Changes

- 飞书回读卡片时 custom_background_style / 丢失的 font_color 归一化：`normalizeStoredCardColors` 还原 cus-N + config.style.color；schema 补充 markdown.font_color 与 column.custom_background_style。

## 0.1.3

### Patch Changes

- 441c53b: disabled 的纯视觉 interactive_container 在表单外不再强制要求 behaviors（对齐官方组件库强调框写法：disabled + 白底/边框/圆角 + 无 behaviors）

## 0.1.2

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
