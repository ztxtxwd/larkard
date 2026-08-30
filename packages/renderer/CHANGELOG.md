# @open-feishu-card/renderer

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
