# @open-feishu-card/renderer

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
