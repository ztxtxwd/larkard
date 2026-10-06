# @open-feishu-card/adapter

## 0.3.16

### Patch Changes

- raw→DSL 保留自定义 `element_id`（丢弃 `_1` 等自动编号）；`column_set`/`column` 的 RAW `actions` 投影为 `action.multi_url`，DSL→RAW 对称回写

## 0.3.15

### Patch Changes

- `normalizeStoredCardColors`：显式 `cus-text-*` 不再并进 `cus-accent` / `cus-muted`（RAW↔DSL 无损；同 hex 的深底浅字保留独立 text token）

## 0.3.14

### Patch Changes

- raw→DSL 保留 plain_text div 的 textStyle（size → text_size，color/customColor → text_color）与 margin，读卡再发不再丢灰色小字样式

## 0.3.13

### Patch Changes

- raw→DSL / dsl→raw 保留 open_url 的 pc_url / ios_url / android_url（复制按钮 lark://client/core/copy 不再在读卡时丢失）

## 0.3.12

### Patch Changes

- `avatar` 双向映射；`picker_date` ↔ `date_picker` 别名
- `raw-to-dsl` 保留 `person_list` 的 `mode`/`style`/`count` 与 `header.notation`
- Updated dependencies
  - @open-feishu-card/schema@0.1.5

## 0.3.11

### Patch Changes

- `config.style.color` 展开不再只认 `cus-*` 前缀：`mm_*` 等任意登记 token 均可展开为 `customBackgroundStyle` / `customBorderColor` / `customColor`
- `interactive_container` 的 `width`/`height`（`Npx` / `fill` / `auto`）写入 `widthValue` / `heightValue`

## 0.3.10

### Patch Changes

- dslToRaw 展开 `interactive_container` 的 `background_style` cus-* 为 `customBackgroundStyle`；同步展开 `collapsible_panel` 的 `background_color` / `border.color`，修复预览缺背景色。

## 0.3.9

### Patch Changes

- `normalizeStoredCardColors` 补齐 `interactive_container` 的 `custom_background_style` 归一化（与 column 一致）；已有 `config.style.color` 时先灌入 registry，避免 cus-bg-N 序号冲突。

## 0.3.8

### Patch Changes

- RAW→DSL 保留 config.summary；bg/text 色 alias 分表防串台；list.items 内 cus-* 色 dslToRaw 展开；custom_border_color 归一化为 border_color

## 0.3.7

### Patch Changes

- `normalizeStoredCardColors` 不再向 markdown 写入 `font_color`（飞书发送接口不接受）；回读缺色时改为 content 内联 `<font color='cus-N'>`，与 0.3.5 RAW→DSL 约定一致。

## 0.3.6

### Patch Changes

- dslToRaw 保留 config.style.color，并将 cus-* 别名展开为 customBackgroundStyle / textStyle.customColor，修复预览与渲染自定义色。

## 0.3.5

### Patch Changes

- RAW→DSL 自定义文字色改为在 markdown content 内联 `<font color>` 引用别名，不再写入 `font_color` 字段。

## 0.3.4

### Patch Changes

- RAW→DSL 自定义文字色：登记到 config.style.color，用 markdown.font_color 引用别名，不再内联 #hex `<font>`。

## 0.3.3

### Patch Changes

- RAW 自定义颜色：`customBackgroundStyle` / `textStyle.customColor` 投影与渲染；`rawToDsl` 输出自动 `normalizeStoredCardColors`。

## 0.3.2

### Patch Changes

- 飞书回读卡片时 custom_background_style / 丢失的 font_color 归一化：`normalizeStoredCardColors` 还原 cus-N + config.style.color；schema 补充 markdown.font_color 与 column.custom_background_style。

## 0.3.1

### Patch Changes

- header title/subtitle 支持 lark_md：RAW 的 originTag:lark_md 投影为公开 `{ tag:'lark_md', content }`，回写时解析成 markdown 元素树，渲染器画出 @ 提及而不是字面 `<at>`。

## 0.3.0

### Minor Changes

- raw→DSL 完整对齐 `feishu-raw-card-to-dsl`：移植 envelope/`json_attachment`、markdown 拼回、table/chart/person/button/video 等专用路径；新增 `rawCardToDsl` / `isRawCardEnvelope`；`degradeUnknown` 改为可选手动降级（不再自动套用）。

## 0.2.1

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。

## 0.2.0

### Minor Changes

- 对齐上游 open-feishu-card@0.14.5：新增 audio/video 渲染与音频水合，markdown 内嵌 `<audio>`，以及 `mergeMentionsIntoPersons` / 命名色 CSS 变量等。

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
