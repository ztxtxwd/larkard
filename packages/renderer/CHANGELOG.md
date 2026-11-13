# @open-feishu-card/renderer

## 0.5.4

### Patch Changes

- 979b3b9: `img.title` 按真机 BaseText 渲染（此前完全忽略，预览里图片标题丢失）：
  
  **结构 / 样式对齐真机 dump**
  
  - 外壳 `.universal-card-image`（width:100%，承载 margin）+ 上方 `.universal-card-image__title`（`margin-bottom:8px`），与真机 CSS 一致。
  - `__wrapper` 补齐 `position:relative / align-items:center / flex:0 1 auto / width:100% / overflow:hidden`；`__host` 补齐 `width:100% / font-size:0 / position:static`（对齐真机 `universal-card-image` 规则）。
  - 外边距（含 `margin:8px 20px`、负 margin 出血）挂到外壳上，标题与图片作为整体参与布局，`calc` 宽度照旧。
  
  **文本能力**
  
  - 支持官方 BaseText 的 `plain_text` 与 `lark_md`：`lark_md` 按 markdown 子树渲染（对齐 / 字号 / 粗体等生效）。
  - 标题的 `text_size` / `text_color` 折叠进 `textStyle`（等价真机服务端归一）；`lines` / `text_lines` 支持行数截断；空标题不占位。
  - RAW ↔ DSL 往返补齐：`rawToDsl` 把图片标题投影成 `plain_text | lark_md` 并保留 `text_size` / `text_color` / `text_align` / `lines`；DSL→RAW 的文本叶子补上 `lines`。
- Updated dependencies [90395f9]
- Updated dependencies [979b3b9]
  - @open-feishu-card/adapter@0.4.2

## 0.5.3

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
- @open-feishu-card/adapter@0.4.1

## 0.5.2

### Patch Changes

- b86a35a: 补齐各组件的 `hover_tips` / `disabled_tips`：
  
  - `button`、`video` 此前完全忽略悬浮提示，现在把文案挂到组件根节点的原生 `title` 上。
  - `interactive_container`、`checker` 改为统一解析，禁用态展示 `disabled_tips`（不再吞掉或错误回退 `hover_tips`）。
  - `select_img` 选项复用同一套解析逻辑（含组件级 `disabled` 连带禁用选项时的 `disabled_tips`）。
  - 统一在 `renderElement` 里给根节点附加 `title`，自定义组件只要元素带 `hover_tips` 也会生效；组件自己已输出的 `title` 不会被覆盖。
  - 兼容 RAW camelCase（`hoverTips` / `disabledTips`）、DSL snake_case（`hover_tips` / `disabled_tips`）以及两种文本叶子形态。

## 0.5.1

### Patch Changes

- 6502b10: `column` 未写 `width` 时按内容宽（auto）渲染，不再默认等分撑满。
  
  真机 `Kn()` 在 `width` / `widthValue` 都缺省时返回 `{}`，即 CSS 默认 `flex-grow: 0` + `width: auto`（贴内容宽）；官方文档 `column.width` 的默认值也是 `auto`。渲染器此前把"缺失"当成 `weighted`（`flexBasis:0 + flexGrow`），于是漏写列宽的卡片在预览里被拉成等宽列，和真机对不上。
  
  同时补齐 `widthValue` 的另外两种 echo（此前只认 `pixels`）：
  
  - `column_width_weighted` → `flex-basis:0` + `flex-grow:<value>`
  - `builtin_column_width: "auto"` → `width:auto`
  
  新增 4 条用例（RAW 三种 echo + 无 width）与 2 条 DSL 用例（`weighted` / `auto`）。

## 0.5.0

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

### Patch Changes

- Updated dependencies [42fb7bd]
  - @open-feishu-card/adapter@0.4.1

## 0.4.0

### Minor Changes

- bdd86c4: 补齐 `img_combination` / `select_img` 全链路支持。
  
  - **schema**：`img_combination.img_list` 支持官方字段 `img_id` / `transparent`；`select_img.options` 支持 `img_id` / `transparent`。
  - **adapter**：RAW ↔ DSL 双向映射——`combinationMode` / `imgList` / `cornerRadiusValue` / `transparent` ↔ `combination_mode` / `img_list[{img_key}]` / `corner_radius` / `combination_transparent`；`select_img` 的 `options[].imageID` → `img_key`、camelCase 配置 → snake_case、RAW `actions` → `behaviors`；`dslToRaw` 反向生成渲染器可用的 RAW 形态。
  - **components**：`ImgCombination` 的图项支持 `imgId` / `transparent`；`SelectImg` 选项支持 `imgId` / `transparent` / `disabledTips` / `hoverTips`，组件级支持 `disabledTips`。
  - **renderer**：新增 `img_combination`（double / triple / bisect / trisect 布局）与 `select_img`（网格、选中/禁用态、表单内 checkbox/radio）渲染，样式对齐网页版引擎；`form` 渲染子元素时注入 `inForm` 上下文。

### Patch Changes

- Updated dependencies [bdd86c4]
  - @open-feishu-card/adapter@0.4.0

## 0.3.6

### Patch Changes

- 6a8360d: 支持视频公开 DSL 的嵌套封面 `cover: { img_key }`。
  
  - adapter：`dslToRaw` 把 `cover.img_key` 映射为 RAW `coverImageID`，不再把嵌套 `cover` 透传进 RAW（避免飞书按未知属性 200621 拒收）。
  - renderer：`resolveVideoCoverSrc` 同时识别扁平 `coverImageID` / `image_key` / `cover_image_key` 与嵌套 `cover`（`img_key` / `imageID` / `image_id` 等）。有媒体源时输出 `<video poster>`，无媒体源时渲染封面壳。
- Updated dependencies [6a8360d]
  - @open-feishu-card/adapter@0.3.20

## 0.3.5

### Patch Changes

- 4a501e0: 预览对齐真机：header 白底 + 输入框/按钮/下拉不再撑满整行。
  
  三处差异都出在渲染层（真机和预览吃的是同一份卡片 JSON），规则逆向自飞书网页版引擎：
  
  - header 底色：真机 default/disabled 模板的 `bg_color` 是空串，即不设背景色、透出卡片根的
    `--bg-float`(#ffffff)。此前这里写死 #f5f6f7(N50)，预览里就多出一条浅灰标题栏，真机并没有。
    改成白色，并给 header 背景层挂 `--no-template`（真机无模板时底部不留内边距）。
  - 输入框：真机 input 默认 `width:100%` 但 `max-width:282px`，只有 `width:"fill"` 才撑满。
  - 下拉：真机 select 默认定宽 282px；`type:"text"` 自适应且无边框；`width:"fill"` 撑满。
  - 按钮：真机按「卡片容器宽度 > 320px」分档（isWide）——宽屏自适应内容宽、窄屏撑满整行；
    text 族恒撑满（文字仍靠左）；`width:"fill"` 恒撑满。此前 0.2.27 那次按「默认按钮撑满整行」
    的结论写死了 block，这次一并纠正，改用容器查询实现窄屏分档。

## 0.3.4

### Patch Changes

- 0ff94c8: 渲染器：负外边距大图真正出血到卡片两边；图片默认直角，不再擅自加 4px 圆角。
  
  **出血（右边留白）**
  DSL 里 `margin: "-20px -20px 0px -20px"` 的顶层大图，本意是顶到卡片边、左右贯穿整行。
  真机上那个带 margin 的盒子 `width` 是 auto，负 margin 让它同时向两侧撑宽，所以图是贯通的；
  渲染器这边盒子写死了 `width:100%`，负 margin 只把它整体左移 20px —— 左边溢出被裁，
  右边就空出一条 20px 的白边。
  
  `applyOuterMargin` 改为按外边距符号区分：水平外边距为正仍收窄（`calc(100% - Npx)`，
  抵消 `body > * { width:100% }`），为负则把盒子撑宽（`calc(100% + Npx)`），并放开
  `max-width`（CSS 的 `max-width:100%` 会把出血宽度夹回容器宽，右边照样留白）。
  对所有组件生效，不只是 img。
  
  **圆角**
  真机网页版 `.universal-card-image__host { border-radius: 0 }`：图片默认直角，圆角只由
  `corner_radius` 给出。渲染器此前在 CSS 里写死 `border-radius: 4px`，导致没声明
  `corner_radius` 的图四角被圆掉，与真机不符。现改为 0，`corner_radius` 的内联圆角不受影响。
  
  **验证**
  新增 2 条用例（负外边距出血的 calc 宽度 + max-width:none；未声明 corner_radius 时不加圆角）。

## 0.3.3

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
- Updated dependencies [3dee401]
  - @open-feishu-card/adapter@0.3.19

## 0.3.2

### Patch Changes

- 253cf20: `markdown` 支持前缀图标 `icon`，补齐链路最后一环。
  
  组件库已正确输出 `icon`、adapter 也保留了它，但渲染器只渲染 `property.elements`，`icon` 被整块丢弃——带图标的分区标题在预览里缺图标。
  
  现在支持两种形态：
  - `standard_icon`（图标字体，含 `color`）
  - `custom_icon`（`img_key` → `<img>`）
  
  未显式给 `size` 时图标跟随文本字号（`small`→12px、`normal`→14px、`heading`→16px），避免回落到固定 16px 与文字不搭。

## 0.3.1

### Patch Changes

- 001c79c: 修复 `overflow` 未注册与 `interactive_container` 边框语义。
  
  - **`overflow`（折叠按钮组）此前未注册**，`renderElement` 遇到它会返回 `null`，整块在预览里凭空消失而真机正常显示。现渲染为「…」图标触发器：静态预览只画触发器，interactive 模式用原生 `<details>` 做纯 CSS 下拉，选项文案与 `multi_url` 跳转都正确输出。
  - **`border_color` 在 `has_border: false` 时仍会画边框**，与官方语义（仅 `has_border: true` 时生效）不符。现在未显式开启 `has_border` 时不再输出边框。

## 0.3.0

### Minor Changes

- 13fdd01: `interactive_container` 支持布局字段，预览与真机对齐。
  
  此前渲染器只读 `vertical_spacing`，完全忽略 `direction` / `horizontal_align` / `vertical_align` / `horizontal_spacing`，容器内子组件一律退化为「左上贴边、固定 4px 行距」——components 包补上这些字段后，预览仍然画不对。
  
  现在：
  - `direction: "horizontal"` → `flex-direction: row`（缺省为 column）
  - 两个 align 按主轴映射：`direction=vertical` 时 `vertical_align→justify-content`、`horizontal_align→align-items`；`direction=horizontal` 时两者交换
  - `horizontal_spacing→column-gap`、`vertical_spacing→row-gap`，均与 direction 无关
  - 未写这些字段时不输出对应样式，沿用原 CSS 默认值

## 0.2.27

### Patch Changes

- 默认按钮按真机撑满整行，不再强制按内容收缩；纯文字按钮文字靠左。

## 0.2.26

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`；渲染器支持交互表单预览（`interactive`）
- Updated dependencies
  - @open-feishu-card/adapter@0.3.17

## 0.2.25

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.16

## 0.2.24

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.15

## 0.2.23

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.14

## 0.2.22

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.13

## 0.2.21

### Patch Changes

- `video`、`button` 应用 `margin`（含水平外边距时 `width: calc(100% - L - R)`），修复与真机左右间距不一致。

## 0.2.20

### Patch Changes

- 正文 `<font color='white'>` / `textStyle.color=white` 映射到 `N00`（对齐引擎 static-white），修复紫底等深色容器上白字被当成默认深色渲染的问题；顺带补齐 `black → N800`。

## 0.2.19

### Patch Changes

- `img` 应用 `margin`（含水平外边距时 `width: calc(100% - L - R)`），修复正文图左右贴边、与真机不一致。

## 0.2.18

### Patch Changes

- 去掉 `interactive_container` CSS 默认 `border-radius: 6px`；未声明或空 `corner_radius` 时不输出圆角，对齐飞书真机。

## 0.2.17

### Patch Changes

- 新增 `avatar`、`collapse_divider`、`fallback_text` 渲染
- 日期/人员选择器（`date_picker`、`picker_time`、`picker_datetime`、`select_person`、`multi_select_person`）静态预览框
- Updated dependencies
  - @open-feishu-card/adapter@0.3.12

## 0.2.16

### Patch Changes

- `collapsible_panel` 折叠标题色对齐真机 `--text-caption`（`var(--N600)`），不再用正文近黑 `#1f2329`

## 0.2.15

### Patch Changes

- 对齐真机：`img.size`（`Wpx Hpx`）定宽高；`interactive_container` 应用宽高与外边距；`collapsible_panel` 支持 `icon_position: follow_text`、未指定时不描边、应用 margin
- 水平外边距与 `body > * { width:100% }` 冲突时改为 `calc(100% - L - R)`，避免块相对卡片边框左右不对称
- Updated dependencies
  - @open-feishu-card/adapter@0.3.11

## 0.2.14

### Patch Changes

- `collapsible_panel` 优先读取 `customBackgroundStyle`（cus-* 经 dslToRaw 展开），修复折叠面板自定义背景色不显示
- Updated dependencies
  - @open-feishu-card/adapter@0.3.10

## 0.2.13

### Patch Changes

- root 默认 `border: 1px solid var(--N300)` 对齐飞书网页版 `--line-border-card`；独立渲染器无消息气泡外包层时在 root 绘制边框

## 0.2.12

### Patch Changes

- body padding 显式 0 覆盖 CSS 默认白边；interactive_container verticalSpacing 与仅可点击时 pointer/hover；去掉 root 默认边框；customBorderColor / cornerRadiusValue / markdown margin 对齐真机
- Updated dependencies
  - @open-feishu-card/adapter@0.3.8

## 0.2.11

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.6

## 0.2.10

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.5

## 0.2.9

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.4

## 0.2.8

### Patch Changes

- RAW 自定义颜色：`customBackgroundStyle` / `textStyle.customColor` 投影与渲染；`rawToDsl` 输出自动 `normalizeStoredCardColors`。
- Updated dependencies
  - @open-feishu-card/adapter@0.3.3

## 0.2.7

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.2

## 0.2.6

### Patch Changes

- header title/subtitle 支持 lark_md：RAW 的 originTag:lark_md 投影为公开 `{ tag:'lark_md', content }`，回写时解析成 markdown 元素树，渲染器画出 @ 提及而不是字面 `<at>`。
- Updated dependencies
  - @open-feishu-card/adapter@0.3.1

## 0.2.5

### Patch Changes

- 对齐真机：`column_set` 有背景时加 4px 内边距与 6px 圆角；`column` 有背景时只加圆角。

## 0.2.4

### Patch Changes

- 修复 `column_set` 的 `background_style: grey` 未渲染：对齐真机写入 `var(--bg-float-overlay)`（light 主题为 N50）。

## 0.2.3

### Patch Changes

- 重新生成内嵌 `BASE_STYLES_CSS`，使 SSR / 运行时注入的样式与 `styles.css` 一致。

## 0.2.2

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.2.1

## 0.2.0

### Minor Changes

- 对齐上游 open-feishu-card@0.14.5：新增 audio/video 渲染与音频水合，markdown 内嵌 `<audio>`，以及 `mergeMentionsIntoPersons` / 命名色 CSS 变量等。

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.2.0

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
- Updated dependencies
  - @open-feishu-card/adapter@0.1.1
