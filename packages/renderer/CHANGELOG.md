# @open-feishu-card/renderer

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
